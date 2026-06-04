import re
import json

with open('C:\\Users\\MR\\.gemini\\antigravity\\brain\\93def232-e0ec-412f-9fbf-a1e7e633d4fb\\.system_generated\\logs\\transcript.jsonl', 'r', encoding='utf-8') as f:
    for line in f:
        if 'grid grid-cols-2 gap-6' in line and 'S4_RocketEditor.tsx' in line:
            data = json.loads(line)
            calls = data.get('tool_calls', [])
            for call in calls:
                if call.get('name') == 'multi_replace_file_content':
                    chunks = call.get('args', {}).get('ReplacementChunks', '[]')
                    import json as j2
                    chunks_data = j2.loads(chunks)
                    for chunk in chunks_data:
                        if 'grid grid-cols-2 gap-6' in chunk.get('ReplacementContent', ''):
                            print("FOUND IT!")
                            print(chunk.get('TargetContent')[:2000])
                            with open('target_content_extracted.txt', 'w', encoding='utf-8') as outf:
                                outf.write(chunk.get('TargetContent'))
