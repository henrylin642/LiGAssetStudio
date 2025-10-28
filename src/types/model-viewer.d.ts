declare global {
  namespace JSX {
    // Allow using the <model-viewer> web component without TypeScript complaints.
    interface IntrinsicElements {
      "model-viewer": Record<string, unknown>;
    }
  }
}

export {};
