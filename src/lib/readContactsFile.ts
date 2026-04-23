export function readContactsFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const validTypes = ['.txt', '.csv'];
    const ext = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    if (!validTypes.includes(ext)) {
      reject(new Error('Formato nao suportado. Use arquivos .txt ou .csv'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      resolve(text);
    };
    reader.onerror = () => {
      reject(new Error('Falha ao ler o arquivo'));
    };
    reader.readAsText(file, 'UTF-8');
  });
}
