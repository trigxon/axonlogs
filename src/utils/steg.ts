export const encodeSteganography = async (file: File, secretMessage: string): Promise<File> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No canvas context');
        ctx.drawImage(img, 0, 0);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imgData.data;

        // Message to binary string
        const msgBuffer = new TextEncoder().encode(secretMessage + '<<END>>');
        let binMessage = '';
        for (let i = 0; i < msgBuffer.length; i++) {
          binMessage += msgBuffer[i].toString(2).padStart(8, '0');
        }

        if (binMessage.length > data.length / 4) {
          return reject('Message too long for this image');
        }

        let msgIndex = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (msgIndex < binMessage.length) {
            const bit = parseInt(binMessage[msgIndex], 10);
            // Clear LSB and set to bit
            data[i] = (data[i] & ~1) | bit; 
            msgIndex++;
          } else {
            break;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], `stego_${file.name}`, { type: 'image/png' }));
          } else {
            reject('Blob creation failed');
          }
        }, 'image/png');
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

export const decodeSteganography = async (imgUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject('No canvas context');
      ctx.drawImage(img, 0, 0);

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;

      let binMessage = '';
      for (let i = 0; i < data.length; i += 4) {
        binMessage += (data[i] & 1).toString();
      }

      // Convert back to text
      const bytes = [];
      for (let i = 0; i < binMessage.length; i += 8) {
        const byte = parseInt(binMessage.substr(i, 8), 2);
        bytes.push(byte);
        if (bytes.length > 7) {
          const text = new TextDecoder().decode(new Uint8Array(bytes));
          if (text.endsWith('<<END>>')) {
            resolve(text.substring(0, text.length - 7));
            return;
          }
        }
      }
      reject('No hidden message found');
    };
    img.onerror = () => reject('Failed to load image for decoding');
    img.src = imgUrl;
  });
};
