"use client";

import { useMemo, useState } from 'react';
import { usePromptStore } from '@/store/promptStore';
import { useChatStore } from '@/store/chatStore';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';

export function PromptPill() {
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const conversations = useChatStore((s) => s.conversations);
  const updateConversation = useChatStore((s) => s.updateConversation);
  const prompts = usePromptStore((s) => s.prompts);
  const [open, setOpen] = useState(false);

  const current = useMemo(() => conversations.find((c) => c.id === currentConversationId) || null, [conversations, currentConversationId]);
  const applied = current?.system_prompt_applied || null;
  const prompt = useMemo(() => prompts.find((p) => p.id === applied?.promptId) || null, [prompts, applied]);

  const clear = () => {
    if (!current) return;
    updateConversation(current.id, { system_prompt_applied: null });
  };

  if (!current) return null;
  // 默认不显示：仅在已应用提示词时展示
  if (!prompt) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 rounded-full text-xs px-2.5">
          {`提示词：${prompt.name}`}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 max-w-[28rem]">
        <div className="px-3 py-2">
          <div className="max-h-60 overflow-auto rounded border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-2 text-xs leading-5 whitespace-pre-wrap">
            {prompt?.content || ''}
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={clear}>移除当前提示词</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

