
content = open(r'i:\AI_Exam_Generator\frontend\src\main.js', 'r', encoding='utf-8').read()
balance = 0
for i, line in enumerate(content.split('\n')):
    open_count = line.count('{')
    close_count = line.count('}')
    balance += open_count - close_count
    if i+1 >= 1 and i+1 <= 868:
        if open_count > 0 or close_count > 0:
             if balance > 1 and i+1 > 330 and i+1 < 340: # Just checking around where I suspect
                 pass
             print(f"Line {i+1:3}: Balance={balance:2} | {line.strip()}")
