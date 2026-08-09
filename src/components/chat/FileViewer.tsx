import React, { useState } from 'react';
import { File, Download, FileText, FileArchive, PlayCircle } from 'lucide-react';

interface FileViewerProps {
  url: string;
  filename: string;
  mimeType: string;
}

const getFileIcon = (mimeType: string, filename: string) => {
  if (mimeType === 'application/pdf' || filename.endsWith('.pdf')) return <FileText className="w-6 h-6 text-accent" />;
  if (mimeType.includes('zip') || filename.endsWith('.zip') || filename.endsWith('.rar')) return <FileArchive className="w-6 h-6 text-accent" />;
  return <File className="w-6 h-6 text-accent" />;
};

const FileViewer: React.FC<FileViewerProps> = ({ url, filename, mimeType }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const isImage = mimeType.startsWith('image/');
  const isVideo = mimeType.startsWith('video/');
  
  if (isImage) {
    return (
      <div className="mt-1 mb-2 rounded-xl overflow-hidden max-w-sm bg-black/20">
        <a href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt={filename} className="w-full h-auto object-cover max-h-[300px] hover:opacity-90 transition-opacity" />
        </a>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div className="mt-1 mb-2 rounded-xl overflow-hidden max-w-sm bg-black/20 relative group">
        {!isPlaying ? (
          <div className="relative cursor-pointer" onClick={() => setIsPlaying(true)}>
            <div className="w-full h-40 bg-panel flex items-center justify-center border border-border rounded-xl">
              <PlayCircle className="w-12 h-12 text-white/50 group-hover:text-white transition-colors" />
            </div>
            <div className="absolute bottom-2 left-2 bg-black/60 px-2 py-1 rounded text-xs truncate max-w-[90%]">
              {filename}
            </div>
          </div>
        ) : (
          <video src={url} controls autoPlay className="w-full h-auto max-h-[300px] rounded-xl" />
        )}
      </div>
    );
  }

  // Fallback Sleek File Card
  const ext = filename.split('.').pop()?.toUpperCase() || 'FILE';

  return (
    <a 
      href={url} 
      download={filename}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-1 mb-2 flex items-center justify-between p-3.5 border border-border rounded-xl bg-panel/50 max-w-sm hover:bg-panel transition-colors group cursor-pointer block"
    >
      <div className="flex items-center gap-3.5 overflow-hidden">
        <div className="p-2 bg-background rounded-lg border border-border">
          {getFileIcon(mimeType, filename)}
        </div>
        <div className="flex flex-col overflow-hidden">
          <span className="text-sm font-medium truncate text-text-primary group-hover:text-accent transition-colors">{filename}</span>
          <span className="text-xs text-text-secondary mt-0.5">{ext}</span>
        </div>
      </div>
      <div className="p-2 bg-background rounded-full group-hover:bg-accent group-hover:text-white transition-colors text-text-secondary shrink-0 ml-2">
        <Download className="w-4 h-4" />
      </div>
    </a>
  );
};

export default FileViewer;
