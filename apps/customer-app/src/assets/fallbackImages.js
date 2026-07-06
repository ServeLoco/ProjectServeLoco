const fallbackProductImage =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="50" fill="#F4EFE6"/>
      <path d="M40 34c-2-5 1-10 1-10M50 32c-2-6 2-11 2-11M60 34c-2-5 1-10 1-10" stroke="#C9BFAE" stroke-width="4" stroke-linecap="round" fill="none"/>
      <path d="M24 56c0 15 11.6 26 26 26s26-11 26-26H24z" fill="#E2963F"/>
      <rect x="20" y="53" width="60" height="7" rx="3.5" fill="#C97A2B"/>
    </svg>
  `);

export { fallbackProductImage };
