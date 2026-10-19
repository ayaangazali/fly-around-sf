let n = 0;

export function nortonSvg(): string {
  const id = `nrt${n++}`;
  return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Portrait of Emperor Norton">
<defs>
<radialGradient id="${id}b" cx="50%" cy="30%" r="75%"><stop offset="0" stop-color="#f8e6bd"/><stop offset="0.6" stop-color="#e2b77a"/><stop offset="1" stop-color="#a8683a"/></radialGradient>
<linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b4c86"/><stop offset="1" stop-color="#132447"/></linearGradient>
<linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1a1615"/><stop offset="0.45" stop-color="#3a3230"/><stop offset="1" stop-color="#141110"/></linearGradient>
<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#c9921f"/></linearGradient>
<clipPath id="${id}k"><circle cx="60" cy="60" r="60"/></clipPath>
</defs>
<g clip-path="url(#${id}k)">
<rect width="120" height="120" fill="url(#${id}b)"/>
<g opacity="0.18" fill="#5b3415"><circle cx="18" cy="24" r="1.2"/><circle cx="101" cy="40" r="0.9"/><circle cx="27" cy="70" r="0.8"/><circle cx="96" cy="78" r="1.1"/><circle cx="14" cy="48" r="0.7"/></g>
<path d="M10 120 C12 97 28 86 47 81 L73 81 C92 86 108 97 110 120 Z" fill="url(#${id}c)"/>
<path d="M60 92 L60 120" stroke="#0e1b36" stroke-width="1.2"/>
<g fill="url(#${id}g)" stroke="#8a5b0e" stroke-width="0.8">
<ellipse cx="27" cy="91" rx="15" ry="6.5" transform="rotate(-20 27 91)"/>
<ellipse cx="93" cy="91" rx="15" ry="6.5" transform="rotate(20 93 91)"/>
</g>
<g stroke="#e6b23c" stroke-width="2.2" stroke-linecap="round">
<path d="M14 97 l-1.5 8 M18.5 98.5 l-1 8 M23 99.5 l-0.5 8 M27.5 100 l0 8 M32 99.5 l0.5 8 M36 98 l1 7"/>
<path d="M106 97 l1.5 8 M101.5 98.5 l1 8 M97 99.5 l0.5 8 M92.5 100 l0 8 M88 99.5 l-0.5 8 M84 98 l-1 7"/>
</g>
<g fill="#f3cf5f" stroke="#8a5b0e" stroke-width="0.6"><circle cx="55" cy="103" r="2.1"/><circle cx="65" cy="103" r="2.1"/><circle cx="55" cy="113" r="2.1"/><circle cx="65" cy="113" r="2.1"/></g>
<path d="M45 81 L60 97 L75 81 L71 76 L49 76 Z" fill="#1a3061" stroke="#e6b23c" stroke-width="1.4" stroke-linejoin="round"/>
<ellipse cx="42.5" cy="58" rx="3.6" ry="5.6" fill="#d9a07a"/>
<ellipse cx="77.5" cy="58" rx="3.6" ry="5.6" fill="#d9a07a"/>
<ellipse cx="60" cy="56" rx="17" ry="20" fill="#ebbb95"/>
<path d="M44 49 C44 44 47 41 50 41 L70 41 C73 41 76 44 76 49 C73 46 70 45 68 45 L52 45 C50 45 47 46 44 49 Z" fill="#6c5a4b"/>
<path d="M42 55 C41 73 46 91 60 96 C74 91 79 73 78 55 C75 64 71 69 60 70 C49 69 45 64 42 55 Z" fill="#776452"/>
<path d="M46 66 C49 79 53 88 60 92 C67 88 71 79 74 66 C70 71 66 73 60 73 C54 73 50 71 46 66 Z" fill="#8a7663" opacity="0.7"/>
<g stroke="#5c4b3d" stroke-width="0.9" fill="none" stroke-linecap="round" opacity="0.8"><path d="M50 78 q2 5 1 9"/><path d="M56 80 q1 5 0 9"/><path d="M64 80 q-1 5 0 9"/><path d="M70 78 q-2 5 -1 9"/></g>
<path d="M48 66 C52 62 57 62.5 60 65 C63 62.5 68 62 72 66 C67 67.6 63.5 68.3 60 67.4 C56.5 68.3 53 67.6 48 66 Z" fill="#5b4a3c"/>
<path d="M60 54 C58.4 59 57.4 61.6 59.4 62.6 C61 63.1 62.6 62.4 62 60.6" fill="none" stroke="#b67a57" stroke-width="1.3" stroke-linecap="round"/>
<ellipse cx="53" cy="53.5" rx="2.1" ry="1.7" fill="#2a1f18"/><ellipse cx="67" cy="53.5" rx="2.1" ry="1.7" fill="#2a1f18"/>
<circle cx="53.7" cy="52.9" r="0.6" fill="#fff" opacity="0.8"/><circle cx="67.7" cy="52.9" r="0.6" fill="#fff" opacity="0.8"/>
<path d="M48.5 49.5 q4.5 -3.2 9 -0.8 M62.5 48.7 q4.5 -2.4 9 0.8" stroke="#4e3f33" stroke-width="2.1" fill="none" stroke-linecap="round"/>
<path d="M36 41.5 C40 38.5 80 38.5 84 41.5 L82 46 C72 43 48 43 38 46 Z" fill="#141110"/>
<path d="M44 41 L46.5 11 C53 7.5 67 7.5 73.5 11 L76 41 Z" fill="url(#${id}h)"/>
<path d="M45 34 L75 34 L75.6 40.5 L44.4 40.5 Z" fill="#7d1d25"/>
<circle cx="70.5" cy="31" r="5.4" fill="url(#${id}g)" stroke="#8a5b0e" stroke-width="0.6"/>
<circle cx="70.5" cy="31" r="2.6" fill="#7d1d25"/>
<path d="M70 27 C70.5 20 75.5 15 82 12.5" stroke="#2c5f45" stroke-width="2.2" fill="none" stroke-linecap="round"/>
<g stroke="#3f8d5f" stroke-width="0.9" opacity="0.9"><path d="M72 22 l-4 -1.5 M74 18.5 l-3.5 -2.5 M77 15.8 l-2.5 -3.5 M73 20.5 l4 0.5 M75.8 17 l4 -0.5 M78.8 14.6 l3.5 -1.5"/></g>
<ellipse cx="85" cy="12" rx="6.2" ry="4.6" fill="#2f9a74" transform="rotate(-28 85 12)"/>
<ellipse cx="85" cy="12" rx="3.2" ry="2.4" fill="#1f4fa3" transform="rotate(-28 85 12)"/>
<circle cx="85" cy="12" r="1.3" fill="#f0c341"/>
</g>
<circle cx="60" cy="60" r="58.5" fill="none" stroke="#f0c341" stroke-opacity="0.55" stroke-width="3"/>
</svg>`;
}
