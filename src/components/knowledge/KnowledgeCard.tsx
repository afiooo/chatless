"use client";

import { Folder, Book, Code, Lock, Database } from 'lucide-react';
import { cn } from "@/lib/utils";

interface KnowledgeCardProps {
  id: string;
  name: string;
  icon: string; // e.g., 'folder', 'book', 'code'
  iconBg?: string; // Gradient class like 'from-blue-400 to-blue-600'
  source: string;
  docCount: number;
  description: string;
  lastUpdated: string;
  isEncrypted?: boolean;
  onView: (id: string) => void;
  onUse: (id: string) => void;
}

// Helper to get Lucide icon component based on string name
const getIconComponent = (iconName: string) => {
  switch (iconName.toLowerCase()) {
    case 'folder': return Folder;
    case 'book': return Book;
    case 'code': return Code;
    default: return Database; // Fallback icon
  }
};

export function KnowledgeCard({
  id,
  name,
  icon,
  iconBg = 'from-gray-400 to-gray-600',
  source,
  docCount,
  description,
  lastUpdated,
  isEncrypted = false,
  onView,
  onUse,
}: KnowledgeCardProps) {
  const IconComponent = getIconComponent(icon);

  return (
    <div className="knowledge-card bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden fade-in flex flex-col h-full">
      <div className="flex p-4 flex-grow">
        <div className={cn(
          "icon-container w-12 h-12 rounded-lg text-white flex items-center justify-center text-xl mr-4 shadow-md flex-shrink-0",
          `bg-gradient-to-br ${iconBg} dark:from-gray-600 dark:to-gray-700` 
        )}>
          <IconComponent className="w-6 h-6" />
        </div>
        <div className="flex-1 flex flex-col min-w-0"> 
          <h3 className="font-semibold text-lg mb-2 text-gray-800 dark:text-gray-200 truncate">{name}</h3>
          <div className="flex items-center gap-3 text-sm mb-3 flex-wrap">
            <span className="tag px-2.5 py-1 bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-100 dark:to-gray-200 rounded-full text-gray-700 dark:text-gray-300">
              {source}
            </span>
            {isEncrypted && (
              <span className="tag px-2.5 py-1 bg-gradient-to-r from-red-100 to-red-200 dark:from-red-900 dark:to-red-800 rounded-full text-red-700 dark:text-red-300 flex items-center gap-1">
                <Lock className="w-3 h-3" />
                加密
              </span>
            )}
            <span className="text-gray-500 dark:text-gray-400">{docCount}个文档</span>
          </div>
          <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2 flex-grow">
            {description}
          </p>
          <div className="text-sm text-gray-500 dark:text-gray-400 mt-auto pt-2">
            最近更新: {lastUpdated}
          </div>
        </div>
      </div>
      {/* Footer with Actions */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-end gap-2">
        <button 
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors duration-200 btn-click-effect"
          onClick={() => onView(id)}
        >
          查看
        </button>
        <button 
          className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-violet-700 bg-violet-100 border border-transparent rounded-lg cursor-pointer transition-all duration-200 hover:bg-violet-200 hover:border-violet-300 hover:text-violet-800 active:bg-violet-300 active:text-violet-800"
          onClick={() => onUse(id)}
        >
          <span>使用</span>
        </button>
      </div>
    </div>
  );
} 