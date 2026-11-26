const paths = {
  mic: 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0ZM5 10v1a7 7 0 0 0 14 0v-1M12 18v4m-4 0h8',
  muted: 'm3 3 18 18M9 8V5a3 3 0 0 1 6 0v6M9 11a3 3 0 0 0 4.6 2.5M5 9v2a7 7 0 0 0 11.3 5.5M19 9v2c0 .8-.1 1.6-.4 2.3M12 18v4m-4 0h8',
  headphones: 'M3 14v-2a9 9 0 0 1 18 0v2M3 14h4v6H3Zm14 0h4v6h-4Z',
  settings: 'M4 7h8m4 0h4M4 17h4m4 0h8M12 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0ZM8 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0Z',
  audio: 'M3 9h4l5-4v14l-5-4H3Zm12 0a4 4 0 0 1 0 6m3-8a7 7 0 0 1 0 10',
};

export default function VoiceIcon({ name }: { name: keyof typeof paths }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
