export {};

declare global {
  interface Window {
    openextract: {
      call: (method: string, params?: any) => Promise<{ success: boolean; data?: any; error?: string }>;
      selectFolder: () => Promise<string | null>;
      saveFolder: () => Promise<string | null>;
    };
  }
}
