export function ImportScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center pb-16">
      <div className="text-5xl mb-4">📥</div>
      <h1 className="text-headline-sm font-bold text-on-surface mb-2">ייבוא מקובץ חיצוני</h1>
      <p className="text-sm text-on-surface-variant max-w-xs leading-relaxed">
        תכונה זו תאפשר ייבוא נתוני יחידה מקובץ Excel או CSV חיצוני.
      </p>
      <div className="mt-4 px-4 py-2 bg-surface-high border border-outline-variant rounded-md text-xs font-mono text-outline">
        בפיתוח — יהיה זמין בגרסה עתידית
      </div>
    </div>
  )
}
