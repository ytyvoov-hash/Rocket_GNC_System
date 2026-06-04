import re
with open('C:\\Users\\MR\\.gemini\\antigravity\\brain\\93def232-e0ec-412f-9fbf-a1e7e633d4fb\\.system_generated\\logs\\transcript.jsonl', 'r', encoding='utf-8') as f:
    text = f.read()

matches = re.findall(r'\"TargetContent\":\"(.*?Aerodynamic Database.*?)\"', text, re.DOTALL)
if matches:
    print('FOUND EXACTLY:')
    raw = matches[0].replace('\\\\n', '\n').replace('\\\"', '\"')
    print(raw[:3000])
else:
    print('Not found')
