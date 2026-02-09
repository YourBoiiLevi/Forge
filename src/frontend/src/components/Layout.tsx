export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white font-mono flex flex-col">
      {/* TopBar will go here */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        {children}
      </main>
    </div>
  );
}
