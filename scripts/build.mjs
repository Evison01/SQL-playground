import {cpSync,mkdirSync,rmSync} from 'node:fs';
// Copy the already-built web app into the portable hosting directory.
rmSync('dist',{recursive:true,force:true});
mkdirSync('dist',{recursive:true});
cpSync('web/dist','dist',{recursive:true});
