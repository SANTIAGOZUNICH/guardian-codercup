export function Scene({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      <div className="scene-backdrop" />
      <div className="scene-grid" />
      <div className="relative z-10 flex min-h-screen w-full flex-col">
        {children}
      </div>
    </div>
  );
}
