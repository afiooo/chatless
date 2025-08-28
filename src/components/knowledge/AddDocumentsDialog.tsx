import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Loader2, FileText, Database, AlertCircle, MessageSquare } from 'lucide-react';
import { UnifiedFileService, type UnifiedFile } from '@/lib/unifiedFileService';
import { KnowledgeService, type KnowledgeBase } from '@/lib/knowledgeService';
import { toast } from '@/components/ui/sonner';

interface AddDocumentsDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  knowledgeBase: KnowledgeBase;
  onSuccess?: () => void;
}

interface DisplayFile {
  id: string;
  name: string;
  type: 'document' | 'chat';
  source?: string;
  conversationId?: string;
  isAlreadyInKB?: boolean;
}

export function AddDocumentsDialog({ open, onOpenChange, knowledgeBase, onSuccess }: AddDocumentsDialogProps) {
  const [files, setFiles] = useState<DisplayFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState(0);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string>('');

  // 加载所有可用文档
  useEffect(() => {
    if (!open) return;
    
    async function loadAllFiles() {
      try {
        setLoading(true);
        setError(null);
        
        const displayFiles: DisplayFile[] = [];
        
        // 1. 加载普通文档
        try {
          const unifiedFiles = await UnifiedFileService.getAllFiles();
          const documentFiles = unifiedFiles
            .filter(f => f.source !== 'chat') // 排除聊天文件
            .filter(f => !f.knowledgeBaseId || f.knowledgeBaseId !== knowledgeBase.id); // 排除已在当前知识库的文件
          
          documentFiles.forEach(file => {
            displayFiles.push({
              id: file.id,
              name: file.name,
              type: 'document',
              source: file.source,
              isAlreadyInKB: !!file.knowledgeBaseId
            });
          });
        } catch (error) {
          console.error('加载普通文档失败:', error);
        }
        
        // 2. 加载聊天文件
        try {
          const { DatabaseService } = await import('@/lib/database/services/DatabaseService');
          const db = DatabaseService.getInstance();
          await db.initialize();
          
          const messageRepo = db.getMessageRepository();
          const chatFileData = await messageRepo.getChatAttachedFiles();
          
          // 转换聊天文件格式
          chatFileData.forEach((file, index) => {
            const chatFileId = `chat_${file.conversation_id}_${index}`;
            displayFiles.push({
              id: chatFileId,
              name: file.fileName,
              type: 'chat',
              conversationId: file.conversation_id,
              isAlreadyInKB: false // 聊天文件默认没有在知识库中
            });
          });
        } catch (error) {
          console.error('加载聊天文件失败:', error);
        }
        
        setFiles(displayFiles);
        
      } catch (error) {
        console.error('加载文件失败:', error);
        setError('加载文件失败');
      } finally {
        setLoading(false);
      }
    }
    
    loadAllFiles();
  }, [open, knowledgeBase.id]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const newSet = new Set(prev);
      newSet.has(id) ? newSet.delete(id) : newSet.add(id);
      return newSet;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0) {
      toast.error('请选择文件');
      return;
    }

    try {
      setAdding(true);
      const selectedIds = Array.from(selected);
      
      for (let i = 0; i < selectedIds.length; i++) {
        const selectedId = selectedIds[i];
        const file = files.find(f => f.id === selectedId);
        
        if (!file) continue;
        
        setProgressMessage(`正在处理: ${file.name}`);
        
        if (file.type === 'chat') {
          // 对于聊天文件，需要先从消息记录中提取并保存到UnifiedFileService
          // 然后再添加到知识库
          try {
            // 这里需要实现聊天文件到知识库的添加逻辑
            // 暂时跳过聊天文件，后续可以实现
            console.log('聊天文件暂时跳过:', file.name);
            toast.warning(`聊天文件 ${file.name} 暂时无法添加到知识库`);
          } catch (error) {
            console.error(`处理聊天文件失败: ${file.name}`, error);
          }
        } else {
          // 普通文档添加到知识库
          await KnowledgeService.addDocumentToKnowledgeBase(selectedId, knowledgeBase.id, {
            onProgress: (p, msg) => {
              const base = (i / selectedIds.length) * 100;
              const segment = p / selectedIds.length;
              setProgress(Math.min(99, Math.round(base + segment)));
              setProgressMessage(msg);
            }
          });
        }
      }

      setProgress(100);
      setProgressMessage('完成');
      toast.success('文档已成功添加并索引');
      
      if (onSuccess) onSuccess();
      onOpenChange(false);
      
    } catch (error) {
      console.error('添加过程出错:', error);
      toast.error('添加过程出错');
    } finally {
      setAdding(false);
      setProgress(0);
      setProgressMessage('');
      setSelected(new Set());
    }
  };

  const getFileIcon = (file: DisplayFile) => {
    if (file.type === 'chat') {
      return <MessageSquare className="h-4 w-4 text-blue-500" />;
    }
    return <FileText className="h-4 w-4 text-slate-500" />;
  };

  const getFileLabel = (file: DisplayFile) => {
    if (file.type === 'chat') {
      return (
        <div className="flex items-center gap-2 flex-1">
          <span className="text-sm truncate text-gray-800 dark:text-gray-200">{file.name}</span>
          <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded dark:bg-blue-900/30 dark:text-blue-400">
            💬 聊天文件
          </span>
        </div>
      );
    }
    
    return (
      <div className="flex items-center gap-2 flex-1">
        <span className="text-sm truncate text-gray-800 dark:text-gray-200">{file.name}</span>
        {file.isAlreadyInKB && (
          <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded dark:bg-green-900/30 dark:text-green-400">
            已入库
          </span>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[80vh] overflow-hidden dark:bg-slate-900 dark:border-slate-600">
        <DialogHeader>
          <DialogTitle className="text-gray-900 dark:text-gray-100">添加文档到知识库</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        ) : adding ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2 text-sm">
              <Database className="h-4 w-4" />
              {progressMessage || '正在添加文档...'}
            </div>
            <Progress value={progress} />
          </div>
        ) : (
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar space-y-2">
            {files.map(file => (
              <label 
                key={file.id} 
                className="flex items-center gap-2 p-2 rounded border hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer"
              >
                <Checkbox 
                  checked={selected.has(file.id)} 
                  onCheckedChange={() => toggle(file.id)} 
                />
                {getFileIcon(file)}
                {getFileLabel(file)}
              </label>
            ))}
            {files.length === 0 && (
              <p className="text-center text-sm text-slate-500 py-8">
                暂无可添加的文档
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="dialogSecondary" onClick={() => onOpenChange(false)} disabled={loading}>取消</Button>
          <Button variant="dialogPrimary" onClick={handleConfirm} disabled={adding || selected.size === 0}>确认添加</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 