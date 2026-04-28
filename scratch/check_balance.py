import re

with open('i:/AI_Exam_Generator/frontend/index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Very simple tag balancer
tags = re.findall(r'<(div|main|nav|section|body|html)|</(div|main|nav|section|body|html)>', content)

stack = []
for i, (open_tag, close_tag) in enumerate(tags):
    if open_tag:
        stack.append((open_tag, i))
    else:
        if not stack:
            print(f"Unexpected close tag </{close_tag}> at position {i}")
        else:
            last_open, last_idx = stack.pop()
            if last_open != close_tag:
                print(f"Mismatch: <{last_open}> (pos {last_idx}) closed by </{close_tag}> (pos {i})")

if stack:
    for tag, i in stack:
        print(f"Unclosed tag <{tag}> at position {i}")
else:
    print("Tags are balanced (among div, main, nav, section, body, html)")
