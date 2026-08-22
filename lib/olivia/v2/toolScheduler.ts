import type { OliviaToolCall } from "./types";
import { isReadOnlyOliviaTool } from "./toolSelection";

export type ScheduledToolResult<T>={call:OliviaToolCall;result:T};

export async function executeOliviaToolBatch<T>(calls:OliviaToolCall[], execute:(call:OliviaToolCall)=>Promise<T>):Promise<ScheduledToolResult<T>[]>{
  if(calls.length>1 && calls.every((call)=>isReadOnlyOliviaTool(call.name))){
    const settled=await Promise.allSettled(calls.map(execute));
    return settled.map((entry,index)=>{
      if(entry.status==="rejected") throw entry.reason;
      return {call:calls[index],result:entry.value};
    });
  }
  const results:ScheduledToolResult<T>[]=[];
  for(const call of calls) results.push({call,result:await execute(call)});
  return results;
}
