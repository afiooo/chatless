import { BaseProvider, CheckResult, LlmMessage, StreamCallbacks } from './BaseProvider';
import { getStaticModels } from '../../provider/staticModels';
import { SSEClient } from '@/lib/sse-client';

export class GoogleAIProvider extends BaseProvider {
  private sseClient: SSEClient;
  private lastContentLength: number = 0; // 记录上一次内容的长度
  private processedChunks: Set<string> = new Set(); // 防止重复处理
  private currentResponseId: string | null = null; // 当前响应的ID

  constructor(baseUrl: string, apiKey?: string) {
    super('Google AI', baseUrl, apiKey);
    this.sseClient = new SSEClient('GoogleAIProvider');
  }

  async fetchModels(): Promise<Array<{name: string, label?: string, aliases?: string[]}> | null> {
    // 仅使用静态模型
    const list = getStaticModels('Google AI');
    return list?.map((m)=>({ name: m.id, label: m.label, aliases: [m.id] })) ?? null;
  }

  async checkConnection(): Promise<CheckResult> {
    // 暂不在线检查，按是否配置密钥给出状态
    const apiKey = await this.getApiKey();
    if (!apiKey) return { ok: false, reason: 'NO_KEY', message: 'NO_KEY' };
    return { ok: true };
  }

  async chatStream(
    model: string,
    messages: LlmMessage[],
    cb: StreamCallbacks,
    _opts: Record<string, any> = {}
  ): Promise<void> {
    const apiKey = await this.getApiKey(model);
    if (!apiKey) {
      console.error('[GoogleAIProvider] No API key provided');
      cb.onError?.(new Error('NO_KEY'));
      return;
    }
    
    // 构造正确的 URL - 使用官方文档中的流式API端点
    const url = `${this.baseUrl.replace(/\/$/, '')}/models/${model}:streamGenerateContent?alt=sse`;
    
    // 构造正确的请求体格式 - 根据官方文档添加role字段
    const body = {
      contents: messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      })),
      generationConfig: { 
        temperature: 0.7,
        // 可选：禁用思考功能以节省成本
        thinkingConfig: {
          thinkingBudget: 0
        }
      }
    };

    console.log('[GoogleAIProvider] Starting chat stream with:', {
      model,
      url,
      hasApiKey: !!apiKey,
      messageCount: messages.length
    });

    // 重置累积内容长度和已处理chunk集合
    this.lastContentLength = 0;
    this.processedChunks.clear();
    this.currentResponseId = null;

    try {
      await this.sseClient.startConnection(
        {
          url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          },
          body,
          debugTag: 'GoogleAIProvider'
        },
        {
          onStart: () => {
            console.log('[GoogleAIProvider] SSE connection started');
            cb.onStart?.();
          },
          onError: (error) => {
            console.error('[GoogleAIProvider] SSE connection error:', error);
            cb.onError?.(error);
          },
          onData: (rawData: string) => {
            console.debug('[GoogleAIProvider] Received raw data:', rawData);
            
            // Google AI的流式响应直接是JSON格式，不是标准SSE格式
            try {
              const parsedData = JSON.parse(rawData);
              //console.debug('[GoogleAIProvider] Parsed chunk:', parsedData);
              
              // 检查响应ID，确保是同一个响应
              if (parsedData.responseId) {
                if (this.currentResponseId && this.currentResponseId !== parsedData.responseId) {
                  console.debug('[GoogleAIProvider] New response ID detected, resetting state');
                  this.lastContentLength = 0;
                  this.processedChunks.clear();
                }
                this.currentResponseId = parsedData.responseId;
              }
              
              // 使用响应ID和内容长度作为唯一标识，防止重复处理
              const chunkKey = `${this.currentResponseId}-${parsedData.candidates?.[0]?.content?.parts?.[0]?.text?.length || 0}`;
              if (this.processedChunks.has(chunkKey)) {
                console.debug('[GoogleAIProvider] Skipping duplicate chunk:', chunkKey);
                return;
              }
              this.processedChunks.add(chunkKey);
              
              // 检查是否有candidates数组
              if (parsedData.candidates && Array.isArray(parsedData.candidates) && parsedData.candidates.length > 0) {
                const candidate = parsedData.candidates[0];
                
                // 提取文本内容
                if (candidate.content?.parts && Array.isArray(candidate.content.parts)) {
                  for (const part of candidate.content.parts) {
                    if (part.text) {
                      // Google AI的流式响应是增量式的，每个chunk只包含新增内容
                      // 直接使用当前chunk的文本内容，不需要计算增量
                      const newContent = part.text;
                      
                      if (newContent.length > 0) {
                        console.debug('[GoogleAIProvider] Emitting incremental token:', newContent);
                        cb.onToken?.(newContent);
                      }
                    }
                  }
                }
                
                // 检查是否完成
                if (candidate.finishReason === 'STOP') {
                  console.log('[GoogleAIProvider] Stream completed (finishReason: STOP)');
                  cb.onComplete?.();
                }
              }
              
              // 检查promptFeedback（Google AI特有的错误处理）
              if (parsedData.promptFeedback?.blockReason) {
                const error = new Error(`Content blocked: ${parsedData.promptFeedback.blockReason}`);
                console.error('[GoogleAIProvider] Content blocked:', parsedData.promptFeedback);
                cb.onError?.(error);
              }
              
            } catch (error) {
              console.error('[GoogleAIProvider] Failed to parse chunk:', error);
              cb.onError?.(error instanceof Error ? error : new Error('Failed to parse response'));
            }
          }
        }
      );
    } catch (error: any) {
      console.error('[GoogleAIProvider] SSE connection failed:', error);
      cb.onError?.(error);
    }
  }

  /**
   * 清理资源
   */
  async destroy(): Promise<void> {
    this.lastContentLength = 0;
    this.processedChunks.clear();
    this.currentResponseId = null;
    await this.sseClient.destroy();
  }

  /**
   * 取消流式连接
   */
  cancelStream(): void {
    this.sseClient.stopConnection();
  }
}
