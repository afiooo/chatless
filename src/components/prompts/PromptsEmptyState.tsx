'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bookmark, Search } from 'lucide-react';
import { PromptEditorDialog } from './PromptEditorDialog';
import { usePromptStore } from '@/store/promptStore';
import { PromptImportExport } from './PromptImportExport';

export function PromptsEmptyState() {
  const [open, setOpen] = useState(false);
  const createPrompt = usePromptStore((s) => s.createPrompt);
  const ui = usePromptStore((s) => s.ui);

  return (
    <div className="w-full flex items-center justify-center">
      <div className="text-center max-w-md w-full p-6">
        <div className="w-12 h-12 mx-auto mb-4 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center">
          {ui?.searchQuery 
            ? <Search className="w-6 h-6 text-gray-400 dark:text-gray-500" strokeWidth={1.5} /> 
            : <Bookmark className="w-6 h-6 text-gray-400 dark:text-gray-500" strokeWidth={1.5} />}
        </div>
        <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
          {ui?.searchQuery ? '未找到匹配的提示词' : '暂无提示词'}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {ui?.searchQuery ? '尝试调整关键词或筛选条件' : '创建或导入提示词，快速在聊天中复用'}
        </div>
        <div className="flex items-center justify-center gap-2 mt-4">
          <Button size="sm" className="h-8" onClick={() => setOpen(true)}>新建提示词</Button>
          <PromptImportExport />
        </div>
      </div>

      {open && (
        <PromptEditorDialog
          open={open}
          onOpenChange={setOpen}
          onSubmit={async (data) => { await createPrompt(data as any); setOpen(false); }}
        />
      )}
    </div>
  );
}

