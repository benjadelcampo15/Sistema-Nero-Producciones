import { LogoPlanix } from "@/components/logo-planix";

export default function LayoutIngreso({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <LogoPlanix className="mx-auto mb-3 h-16 w-16 text-stone-900" />
          <p className="text-2xl font-black tracking-[0.2em] text-stone-900">PLANIX</p>
          <p className="text-xs text-stone-500">Toda la operación de la empresa alrededor de un mismo sistema</p>
        </div>
        {children}
      </div>
    </main>
  );
}
