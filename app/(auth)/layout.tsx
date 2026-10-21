export default function LayoutIngreso({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-2xl font-black tracking-[0.3em] text-stone-900">NERO</p>
          <p className="text-xs uppercase tracking-widest text-stone-500">Producciones · Administración</p>
        </div>
        {children}
      </div>
    </main>
  );
}
