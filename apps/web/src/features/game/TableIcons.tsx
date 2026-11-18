export function Icon({ name }: { name: 'gun' | 'horse' | 'star' | 'log' | 'gear' }) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === 'gun' ? <><path d="M4 10h24v6H14l-4 12-6-2 4-13M22 10V6M15 16v5h6v-5M4 10V7h11" /><path d="M11 9v8m4-7v6m4-6v6" /></> : name === 'horse' ? <><path d="m11 28 3-8-5-3-4 2-2-4L17 4l5 1-3 4q11 4 7 19M16 7l-1-5 7 3M11 28h15" /><circle cx="17" cy="12" r="1" fill="currentColor" /></> : name === 'star' ? <path d="m16 2 4 9 10 1-8 7 3 11-9-6-9 6 3-11-8-7 10-1Z" /> : name === 'log' ? <><path d="M4 5h24v18H15l-7 5v-5H4ZM9 11h14M9 16h10" /></> : <><path d="m13 3 6 0 1 4 4 2 4-1 3 5-3 3v4l3 3-3 5-4-1-4 2-1 3h-6l-1-3-4-2-4 1-3-5 3-3v-4l-3-3 3-5 4 1 4-2Z" transform="translate(0 -1) scale(.95)" /><circle cx="15.5" cy="16" r="5" /></>}
  </svg>;
}

