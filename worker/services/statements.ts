import { ApiError, requiredText } from '../http.ts'
import { extractionPrompt, parseAiStatement } from '../../src/domain/ai-statement.ts'
export async function parseStatement(body: Record<string, unknown>, transport: typeof fetch = fetch) {
  const provider = requiredText(body.provider, 'Provider', 30)
  const model = requiredText(body.model, 'Model', 200), key = requiredText(body.key, 'API key', 8192)
  if (!['gemini','openai','openrouter'].includes(provider)) throw new ApiError(400,'PROVIDER_UNSUPPORTED','Use Gemini, OpenAI or OpenRouter for server-side document extraction. Custom providers use the direct connection.')
  const task = body.task === 'enrich' ? 'enrich' : 'extract'
  let prompt = extractionPrompt, file: {mime:string;data:string;name:string}|undefined
  if (task === 'enrich') {
    prompt = requiredText(body.prompt, 'Enrichment input', 100000)
  } else {
    const mime = requiredText(body.mimeType, 'File type', 50), data = requiredText(body.base64Data, 'File', 16777216), name = requiredText(body.fileName, 'Filename', 180)
    if (!['application/pdf','image/png','image/jpeg','image/webp'].includes(mime) || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4) throw new ApiError(400,'INVALID_FILE','Choose a PDF, PNG, JPEG or WebP statement.')
    const signature = atob(data.slice(0,Math.min(data.length,32)))
    if (!(mime === 'application/pdf' ? signature.startsWith('%PDF-') : mime === 'image/png' ? signature.startsWith('\x89PNG') : mime === 'image/jpeg' ? signature.startsWith('\xff\xd8') : signature.startsWith('RIFF') && signature.includes('WEBP'))) throw new ApiError(400,'INVALID_FILE','The file contents do not match its type.')
    file = {mime,data,name}
  }
  const gemini = provider === 'gemini'
  const endpoint = gemini ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent` : provider === 'openai' ? 'https://api.openai.com/v1/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions'
  const content: unknown[] = [{type:'text',text:prompt}]
  if (file) content.push(file.mime === 'application/pdf' ? {type:'file',file:{filename:file.name,file_data:`data:${file.mime};base64,${file.data}`}} : {type:'image_url',image_url:{url:`data:${file.mime};base64,${file.data}`}})
  let response: Response
  try { response = await transport(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(gemini ? {'x-goog-api-key':key} : {Authorization:`Bearer ${key}`})},redirect:'error',signal:AbortSignal.timeout(120000),body:JSON.stringify(gemini ? {contents:[{parts:[{text:prompt},...(file ? [{inlineData:{mimeType:file.mime,data:file.data}}] : [])]}],generationConfig:{responseMimeType:'application/json',maxOutputTokens:32768}} : {model,store:false,messages:[{role:'user',content}]})}) }
  catch { throw new ApiError(504,'EXTRACTION_TIMEOUT','Your provider did not complete extraction. Try a smaller statement.') }
  if (!response.ok) throw new ApiError(502,'PROVIDER_REJECTED',`Your provider rejected extraction (${response.status}). Check your key and choose a model that supports this file type.`)
  const result = await response.json() as any
  if (result.choices?.[0]?.finish_reason === 'length' || result.candidates?.[0]?.finishReason === 'MAX_TOKENS') throw new ApiError(422,'TRUNCATED_EXTRACTION','The model ran out of output space. Split the statement into smaller files.')
  const text = gemini ? result.candidates?.[0]?.content?.parts?.filter((part:any)=>!part.thought).map((part:any)=>part.text ?? '').join('') : result.choices?.[0]?.message?.content
  if (typeof text !== 'string') throw new ApiError(502,'INVALID_EXTRACTION','The model returned no usable extraction.')
  if (task === 'enrich') return {text}
  try { return parseAiStatement(text) } catch (error) { throw new ApiError(422,'INVALID_EXTRACTION',error instanceof Error ? error.message : 'Invalid extraction.') }
}
