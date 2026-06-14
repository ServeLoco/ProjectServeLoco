const fallbackProductImage =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240">
      <rect width="320" height="240" rx="24" fill="#F4F1EA"/>
      <rect x="88" y="60" width="144" height="120" rx="20" fill="#FFFFFF" stroke="#DED8CC" stroke-width="6"/>
      <circle cx="128" cy="102" r="18" fill="#F1B84B"/>
      <path d="M102 158l42-42 28 28 20-20 30 34H102z" fill="#78A083"/>
    </svg>
  `);

export { fallbackProductImage };
