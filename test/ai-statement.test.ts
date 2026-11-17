import test from 'node:test'
import assert from 'node:assert/strict'
import {parseAiStatement} from '../src/domain/ai-statement.ts'
const statement={currency:'SGD',periodStart:'2026-10-01',periodEnd:'2026-10-31',openingBalance:'469.50',closingBalance:'369.50',transactions:[{date:'2026-10-02',description:'Cafe',amount:'-100.00',category:'Dining',type:'expense'}]}
test('AI extraction preserves cents and only verifies a reconciled complete statement',()=>{const result=parseAiStatement(JSON.stringify(statement));assert.equal(result.rows[0].cents,-10000);assert.equal(result.balance?.closing,36950);assert.equal(result.rows[0].review,false)})
test('AI extraction rejects invented balance reconciliation, invalid dates and truncated output',()=>{for(const data of [{...statement,closingBalance:'370.00'},{...statement,truncated:true},{...statement,transactions:[{...statement.transactions[0],date:'2026-02-30'}]},{...statement,transactions:[{...statement.transactions[0],amount:'-100.001'}]}]) assert.throws(()=>parseAiStatement(JSON.stringify(data)))})

import {parseStatement} from '../worker/services/statements.ts'
test('document route uses the supplied provider model and key without a fixed model', async()=>{
  const result=await parseStatement({provider:'openai',model:'user-selected-model',key:'test-user-key',mimeType:'application/pdf',fileName:'test.pdf',base64Data:btoa('%PDF-1.7 test')},async (url,init)=>{
    assert.equal(url,'https://api.openai.com/v1/chat/completions')
    assert.equal((init!.headers as Record<string,string>).Authorization,'Bearer test-user-key')
    const payload=JSON.parse(init!.body as string)
    assert.equal(payload.model,'user-selected-model');assert.equal(payload.store,false)
    assert.ok(payload.messages[0].content[1].file.file_data.startsWith('data:application/pdf;base64,'))
    return Response.json({choices:[{message:{content:JSON.stringify(statement)},finish_reason:'stop'}]})
  })
  assert.equal('rows' in result && result.rows[0].cents,-10000)
})
test('document route rejects fake file types before contacting a provider',async()=>{
  await assert.rejects(parseStatement({provider:'gemini',model:'selected',key:'test',mimeType:'application/pdf',fileName:'bad.pdf',base64Data:btoa('not a PDF')},async()=>{throw new Error('must not contact provider')}),/contents do not match/)
})
