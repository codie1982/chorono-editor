import { useId } from 'react'

/** Static vector composition: no textures, render loop or animation-engine work at startup. */
export function WelcomeArtwork() {
  const gradient = useId()
  return <svg viewBox="0 0 560 310" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={gradient} x1="146" y1="46" x2="410" y2="250" gradientUnits="userSpaceOnUse">
        <stop stopColor="#899AFF" /><stop offset="1" stopColor="#4C64D9" />
      </linearGradient>
    </defs>
    <rect x="22" y="21" width="506" height="249" rx="15" fill="#14181F" stroke="#2A313D" />
    <path d="M22 55h506" stroke="#2A313D" />
    <circle cx="41" cy="38" r="3" fill="#616A78" /><circle cx="53" cy="38" r="3" fill="#454D59" /><circle cx="65" cy="38" r="3" fill="#454D59" />
    <text x="269" y="42" fill="#929CAB" fontSize="10" fontFamily="monospace" textAnchor="middle" letterSpacing="2">COMPOSITION / 001</text>
    <path d="M57 78h435M57 120h435M57 162h435M57 204h435M100 78v150M185 78v150M270 78v150M355 78v150M440 78v150" stroke="#222832" strokeDasharray="2 6" />
    <path d="M72 204c62-134 107-127 177-61s95 77 175-39" stroke="#657391" strokeWidth="1.5" strokeDasharray="4 6" />
    <path d="m102 91 43 15m258 65 48-12" stroke="#C0CAFF" />
    <circle cx="102" cy="91" r="4" fill="#14181F" stroke="#C0CAFF" /><circle cx="451" cy="159" r="4" fill="#14181F" stroke="#C0CAFF" />
    <g transform="rotate(-9 280 150)">
      <rect x="151" y="80" width="255" height="138" rx="12" fill={`url(#${gradient})`} />
      <text x="177" y="174" fill="white" fontSize="59" fontWeight="550" letterSpacing="-3" fontFamily="system-ui, sans-serif">hareket.</text>
      <rect x="145" y="74" width="267" height="150" stroke="#B8C5FF" strokeWidth="1" />
      {[[145, 74], [412, 74], [145, 224], [412, 224]].map(([x, y]) => <rect key={`${x}-${y}`} x={x - 3} y={y - 3} width="6" height="6" fill="#DDE4FF" />)}
    </g>
    <circle cx="443" cy="101" r="26" fill="#F0B796" />
    <path d="m443 87 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" fill="#795344" />
    <rect x="58" y="216" width="49" height="32" rx="8" fill="#BFCBB8" transform="rotate(-14 58 216)" />
    <rect x="110" y="254" width="331" height="42" rx="9" fill="#191E27" stroke="#353D4B" />
    <path d="M130 266h289M130 282h289" stroke="#2C3544" />
    <rect x="141" y="264" width="155" height="10" rx="3" fill="#6F80D4" />
    <rect x="193" y="278" width="202" height="7" rx="3" fill="#8B6654" />
    <path d="M267 257v35" stroke="#D4DDFF" strokeWidth="1.3" />
    <path d="m263 255 4 5 4-5" fill="#D4DDFF" />
    <path d="m347 177 5 27 6-9 11-3Z" fill="#F4F6FF" stroke="#232A37" strokeWidth="1.5" />
  </svg>
}
