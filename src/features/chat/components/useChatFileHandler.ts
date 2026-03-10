import { useCallback } from 'react';

interface UseChatFileHandlerProps {
  onPasteImage?: (base64: string) => void;
  onPasteFile?: (content: string, filename: string) => void;
}

export function useChatFileHandler({
  onPasteImage: _onPasteImage,
  onPasteFile: _onPasteFile,
}: UseChatFileHandlerProps) {
  const handlePaste = useCallback((_e: React.ClipboardEvent) => {
    // Stub implementation
  }, []);

  const handleDrop = useCallback((_e: React.DragEvent) => {
    // Stub implementation
  }, []);

  const handleFileSelect = useCallback((_e: React.ChangeEvent<HTMLInputElement>) => {
    // Stub implementation
  }, []);

  return { handlePaste, handleDrop, handleFileSelect };
}
