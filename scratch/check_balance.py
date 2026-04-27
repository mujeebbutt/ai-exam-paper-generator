
content = open(r'i:\AI_Exam_Generator\frontend\src\main.js', 'r', encoding='utf-8').read()
balance = 0
p_balance = 0
for i, char in enumerate(content):
    if char == '{':
        balance += 1
    elif char == '}':
        balance -= 1
    if balance < 0:
        # Find line number
        line_no = content[:i].count('\n') + 1
        print(f"Brace mismatch (extra '}}') at line {line_no}")
        # Show some context
        start = max(0, i - 20)
        end = min(len(content), i + 20)
        print(f"Context: ...{content[start:end]}...")
        break
    
    if char == '(':
        p_balance += 1
    elif char == ')':
        p_balance -= 1
    if p_balance < 0:
        line_no = content[:i].count('\n') + 1
        print(f"Paren mismatch (extra ')') at line {line_no}")
        start = max(0, i - 20)
        end = min(len(content), i + 20)
        print(f"Context: ...{content[start:end]}...")
        break
else:
    print(f"Final Balance: Braces={balance}, Parens={p_balance}")
    if balance > 0:
        print("Missing closing braces")
    if p_balance > 0:
        print("Missing closing parentheses")
