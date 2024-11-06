export function blobToDataURL(blob: Blob) {
  return new Promise<string>(function(resolve) {
    const a = new FileReader();
    a.addEventListener('load', (event) => {
      if (typeof event?.target?.result === 'string') {
        resolve(event.target.result); 
      }
    });
    a.readAsDataURL(blob);
  });
}

export function dataURLToBlob(dataurl: string) {
  const arr = dataurl.split(',');
  const dataURLMatch = (arr[0] ?? '').match(/:(.*?);/);
  if (dataURLMatch) {
    const mime = dataURLMatch[1];
    const bstr = window.atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while(n--){
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
  }
  else {
    return undefined;
  }
}