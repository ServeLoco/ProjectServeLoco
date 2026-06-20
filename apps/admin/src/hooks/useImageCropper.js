import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Hook that wraps an existing file input + upload flow and intercepts the
 * selected file to show the cropper modal first. Returns props you can spread
 * onto a hidden `<input type="file">` and an `openCropper(file)` helper if
 * you want to trigger it from a drag-drop handler.
 *
 * Usage:
 *   const { fileInputProps, cropperProps } = useImageCropper({
 *     type: 'product',
 *     onCropped: async (file) => { /* upload via existing API *\/ },
 *   });
 *
 *   <input type="file" hidden {...fileInputProps} />
 *   <ImageCropper {...cropperProps} onApply={onCropped} />
 */
export function useImageCropper({ type, defaultAspect, onCropped, onSkip }) {
  const [pendingFile, setPendingFile] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [open, setOpen] = useState(false);
  const objectUrlRef = useRef(null);

  const close = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPendingFile(null);
    setImageSrc(null);
    setOpen(false);
  }, []);

  const startWithFile = useCallback((file) => {
    if (!file) return;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setPendingFile(file);
    setImageSrc(url);
    setOpen(true);
  }, []);

  const fileInputProps = {
    onChange: (e) => {
      const file = e.target.files && e.target.files[0];
      // always reset the input so re-selecting the same file fires onChange
      if (e.target) e.target.value = '';
      if (file) startWithFile(file);
    },
  };

  // cleanup on unmount
  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  return {
    fileInputProps,
    cropperProps: {
      open,
      file: pendingFile,
      imageSrc,
      type,
      defaultAspect,
      onCancel: close,
      onApply: async (croppedFile) => {
        try {
          await onCropped(croppedFile);
        } finally {
          close();
        }
      },
      onSkip: async () => {
        try {
          if (onSkip) await onSkip(pendingFile);
          else if (onCropped) await onCropped(pendingFile);
        } finally {
          close();
        }
      },
    },
  };
}
