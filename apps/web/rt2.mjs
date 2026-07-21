import { createPublicClient, http, parseAbiItem } from 'viem'
import { celo } from 'viem/chains'
const ADDR='0xA8cFC1B4365518f56954382B6Fab25a5382f5C49'
const event=parseAbiItem('event PixelsPurchased(address indexed buyer, address indexed token, uint256[] ids, uint256 totalCost)')
const cur=72740000n, fromBlock=71171405n
const CHUNK=5000n,MP=10
const ranges=[];for(let s=fromBlock;s<=cur;s+=CHUNK){const e=s+CHUNK-1n>cur?cur:s+CHUNK-1n;ranges.push({from:s,to:e})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
for(const [name,url] of [['forno','https://forno.celo.org'],['drpc','https://celo.drpc.org']]){
  const client=createPublicClient({chain:celo,transport:http(url)})
  async function retry(r){let e;for(let a=0;a<=4;a++){try{return await client.getLogs({address:ADDR,event,fromBlock:r.from,toBlock:r.to})}catch(err){e=err;await sleep(150*(a+1))}}throw e}
  for(let run=1;run<=3;run++){
    const logs=[];let fails=0
    for(let i=0;i<ranges.length;i+=MP){const b=ranges.slice(i,i+MP)
      const res=await Promise.allSettled(b.map(retry));for(const r of res){if(r.status==='fulfilled')logs.push(...r.value);else fails++}}
    console.log(`${name} run${run} fails=${fails} logs=${logs.length}`)
  }
}
