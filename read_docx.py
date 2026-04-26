import zipfile
import xml.etree.ElementTree as ET
import sys

def get_docx_text(path):
    """
    Take the path of a docx file as argument, return the text in unicode.
    """
    document = zipfile.ZipFile(path)
    xml_content = document.read('word/document.xml')
    document.close()
    tree = ET.fromstring(xml_content)
    
    # Define namespace
    word_ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
    
    text = ""
    for paragraph in tree.iter(word_ns + 'p'):
        for run in paragraph.iter(word_ns + 'r'):
            for t in run.iter(word_ns + 't'):
                text += t.text
        text += "\n"
    return text

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python read_docx.py <path>")
        sys.exit(1)
    
    try:
        text = get_docx_text(sys.argv[1])
        sys.stdout.buffer.write(text.encode('utf-8'))
    except Exception as e:
        print(f"Error: {e}")
