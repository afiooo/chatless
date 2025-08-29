"use client";

import { Message, StreamCallbacks, ChatOptions } from './types';
import type { BaseProvider } from './providers/BaseProvider';
// removed unused imports
import { ProviderRegistry } from './index';
import { ParameterPolicyEngine } from './ParameterPolicy';
import { OpenAICompatibleProvider } from './providers/OpenAICompatibleProvider';
import { OpenAIProvider } from './providers/OpenAIProvider';
import { GoogleAIProvider } from './providers/GoogleAIProvider';
import { AnthropicProvider } from './providers/AnthropicProvider';
import { DeepSeekProvider } from './providers/DeepSeekProvider';

/**
 * 简化版 LLMInterpreter：
 *  1. 仅依赖 ProviderRegistry 中已注册的 Provider 策略。
 *  2. 不再支持旧 metadata.json / 模板化请求的兼容路径。
 */
export class LLMInterpreter {
  /**
   * 非流式 chat：内部调用 streamChat 聚合 token 后返回。
   */
  async chat(
    provider: string,
    model: string,
    messages: Message[],
    options: ChatOptions = {}
  ): Promise<{ content: string; raw: any }> {
    let content = '';
    // 确保等待到 onComplete 后再返回，避免 Provider 流实现“立即 resolve”导致返回空字符串
    let resolveDone: (() => void) | null = null;
    let rejectDone: ((e: Error) => void) | null = null;
    const donePromise = new Promise<void>((resolve, reject) => {
      resolveDone = resolve; rejectDone = reject;
    });

    await this.streamChat(
      provider,
      model,
      messages,
      {
        onToken: (t) => { content += t; },
        onComplete: () => { if (resolveDone) resolveDone(); },
        onError: (e) => { if (rejectDone) rejectDone(e); },
      },
      options
    ).catch(() => {});

    try { await donePromise; } catch { /* 忽略，交由上层回退 */ }
    return { content, raw: null };
  }

  // —— 流控制 ——
  private currentStreamController: AbortController | null = null;
  private sseUnlisten: Array<() => void> = [];
  // 记录当前活跃的 Provider，用于用户点击“停止生成”时通知具体 Provider 关闭其内部 SSE 客户端
  private activeProvider: BaseProvider | null = null;

  /** 初始化占位（保持与旧 API 兼容） */
  async initialize(_forceUpdate = false): Promise<void> {
    // 新实现无需任何预处理，直接返回。
    return;
  }

  /** 取消当前正在进行的流式请求 */
  cancelStream(): void {
    // 0. 通知当前 Provider 主动关闭（确保其内部的 SSEClient 也会移除监听并调用后端 stop_sse）
    try {
      this.activeProvider?.cancelStream?.();
    } catch { /* ignore */ }

    // 1. fetch 流
    if (this.currentStreamController) {
      this.currentStreamController.abort();
      this.currentStreamController = null;
    }
    // 2. SSE 流
    if (this.sseUnlisten.length) {
      this.sseUnlisten.forEach((u) => {
        try { u(); } catch { /* ignore */ }
      });
      this.sseUnlisten = [];
      import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('stop_sse').catch(() => {}))
        .catch(() => {});
    }

    // 同时清理当前活跃 provider 的引用，避免后续误用
    this.activeProvider = null;
  }

  /**
   * 统一流式聊天接口，仅通过 ProviderRegistry 调度。
   */
  async streamChat(
    provider: string,
    model: string,
    messages: Message[],
    callbacks: StreamCallbacks,
    options: ChatOptions = {}
  ): Promise<void> {
    const useProvider = provider; // 不做魔法纠正，维持调用方选择

    const strategy = ProviderRegistry.get(useProvider);
    if (!strategy) {
      const err = new Error(`Provider '${useProvider}' 未注册`);
      callbacks.onError?.(err);
      throw err;
    }

    // 计算参数策略应用时的“有效 Provider 名称”与“生效策略”
    // 任何 Provider 只要为模型/Provider 配置了“请求策略”，就按策略视作对应的真实 Provider，
    // 以便 ParameterPolicyEngine 应用正确的参数形态。
    let policyProviderName: string = useProvider;
    let effectiveStrategy: 'openai'|'openai-responses'|'openai-compatible'|'anthropic'|'gemini'|'deepseek'|null = null;
    try {
      try {
        const { specializedStorage } = await import('@/lib/storage');
        const s = (await specializedStorage.models.getModelStrategy(useProvider, model))
          || (await specializedStorage.models.getProviderDefaultStrategy(useProvider))
          || null;
        if (s) {
          effectiveStrategy = s as any;
          policyProviderName = ((): string => {
            switch (s) {
              case 'gemini': return 'Google AI';
              case 'anthropic': return 'Anthropic';
              case 'deepseek': return 'DeepSeek';
              case 'openai': return 'OpenAI';
              case 'openai-compatible':
              default: return 'OpenAI-Compatible';
            }
          })();
        }
      } catch { /* ignore */ }

      // 应用参数策略（按 Provider/模型正则自动注入/修正）
      const refined = ParameterPolicyEngine.apply(policyProviderName, model, options || {});

      // 若存在"生效策略"，则在解释器层按策略委派到对应 Provider 实现，
      // 以解决自定义聚合 Provider 在注册时为 openai-compatible 的情况。
      if (effectiveStrategy) {
        // 检查原始Provider是否需要API密钥，如果不需要则跳过委派
        const { providerRepository } = await import('@/lib/provider/ProviderRepository');
        const providers = await providerRepository.getAll();
        const originalProvider = providers.find(p => p.name === useProvider);
        
        if (originalProvider && !originalProvider.requiresKey) {
          // 如果原始Provider不需要API密钥，直接使用原始Provider，不进行委派
          this.activeProvider = strategy;
          await strategy.chatStream(model, messages as any, callbacks, refined);
          return;
        }
        
        const base = (strategy as any).baseUrl;
        const display = useProvider; // 维持原 Provider 名称，便于 KeyManager 取 key
        
        // 获取原始Provider的API密钥
        let apiKey: string | undefined = undefined;
        try {
          const { KeyManager } = await import('@/lib/llm/KeyManager');
          // 先尝试获取模型级别的API密钥
          const modelKey = await KeyManager.getModelKey(display, model);
          // 如果没有模型级别的密钥，尝试获取Provider级别的密钥
          if (modelKey) {
            apiKey = modelKey;
          } else {
            const providerKey = await KeyManager.getProviderKey(display);
            apiKey = providerKey || undefined;
          }
        } catch (error) {
          console.warn(`Failed to get API key for ${display}:`, error);
        }
        
        let delegate: BaseProvider;
        switch (effectiveStrategy) {
          case 'gemini': delegate = new GoogleAIProvider(base+"/v1beta/", apiKey); (delegate as any).aliasProviderName = display; break;
          case 'anthropic': delegate = new AnthropicProvider(base, apiKey); (delegate as any).aliasProviderName = display; break;
          case 'deepseek': delegate = new DeepSeekProvider(base, apiKey); (delegate as any).aliasProviderName = display; break;
          case 'openai': delegate = new OpenAIProvider(base, apiKey, display); (delegate as any).aliasProviderName = display; break;
          case 'openai-compatible': default: delegate = new OpenAICompatibleProvider(base, apiKey, display); (delegate as any).aliasProviderName = display; break;
        }
        this.activeProvider = delegate;
        await delegate.chatStream(model, messages as any, callbacks, refined);
        return;
      }

      // 默认：使用原始 Provider
      this.activeProvider = strategy;
      await strategy.chatStream(model, messages as any, callbacks, refined);
    } catch (e: any) {
      const strategyLabel = effectiveStrategy ? (effectiveStrategy as string) : '(未设置)';
      const extra = `模型: ${model} · Provider: ${provider} · 策略: ${strategyLabel}`;
      const msg = (e && typeof e.message === 'string') ? e.message : String(e);
      const merged = msg.includes(extra) ? msg : `${msg}\n${extra}`;
      const err = new Error(merged);
      try {
        const orig: any = e;
        if (orig && orig.code) Object.assign(err, { code: orig.code });
      } catch { /* noop */ }
      callbacks.onError?.(err);
      throw err;
    }
  }
}

// 保持旧默认实例导出（部分代码可能直接使用）
export const llmInterpreter = new LLMInterpreter();
