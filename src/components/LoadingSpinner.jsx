export default function LoadingSpinner({ text = 'Carregando...' }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-5">
      <div className="relative w-14 h-14">
        <div className="absolute inset-0 rounded-full border-4 border-[#002b5c]" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#e11d48] animate-spin" />
      </div>
      <p className="text-slate-400 text-sm tracking-wide">{text}</p>
    </div>
  )
}
