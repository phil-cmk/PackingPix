import React from 'react';
const paths = {
box:'m12 3 9 5v9l-9 5-9-5V8zm0 10v9M3 8l9 5 9-5M7.5 5.5l9 5',
grid:'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
scan:'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M3 12h18M8 7h2v2H8zm6 0h2v2h-2zM8 15h2v2H8zm6 0h2v2h-2z',
upload:'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
download:'M12 3v13m-5-5 5 5 5-5M4 16v5h16v-5',
database:'M3 5c0-4 18-4 18 0S3 9 3 5v7c0 4 18 4 18 0V5M3 12v7c0 4 18 4 18 0v-7',
shield:'M12 3 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 12l3 3 5-6',
check:'m5 12 4 4L19 6', clock:'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0M12 7v5l3 2',
arrow:'M5 12h14m-5-5 5 5-5 5', chevron:'m9 5 7 7-7 7',
search:'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 1 1 13 0m-1 5.5 5 5',
close:'m6 6 12 12M6 18 18 6',
laptop:'M5 3h14v13H5zm0 13-3 4h20l-3-4M10 20h4',
camera:'m8 5 2-2h4l2 2h5v15H3V5zm8 7a4 4 0 1 1-8 0 4 4 0 1 1 8 0',
info:'M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0M12 11v6m0-10v1',
spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
wifi:'M3 8c5-5 13-5 18 0M6 12c3-3 9-3 12 0M9 16c2-2 4-2 6 0M12 20h.01'
};
export default function Icon({name, size = 20}) {
return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.box}/></svg>;
}