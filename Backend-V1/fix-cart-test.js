const fs = require('fs');
let content = fs.readFileSync('tests/cartOrder.test.js', 'utf8');

// Replace the mockResolvedValueOnce chains for mockConnection.query
content = content.replace(/\.mockResolvedValueOnce\(\[\{ insertId: 1001 \}\]\);/g, 
  '.mockResolvedValueOnce([[{ count: 0 }]])\n      .mockResolvedValueOnce([{ insertId: 1001 }])\n      .mockResolvedValueOnce([[{ COLUMN_NAME: "item_type" }]])\n      .mockResolvedValueOnce([{ affectedRows: 1 }]);');
content = content.replace(/\.mockResolvedValueOnce\(\[\{ insertId: 1002 \}\]\);/g, 
  '.mockResolvedValueOnce([[{ count: 0 }]])\n      .mockResolvedValueOnce([{ insertId: 1002 }])\n      .mockResolvedValueOnce([[{ COLUMN_NAME: "item_type" }]])\n      .mockResolvedValueOnce([{ affectedRows: 1 }]);');

fs.writeFileSync('tests/cartOrder.test.js', content);
console.log('Fixed cartOrder.test.js');
