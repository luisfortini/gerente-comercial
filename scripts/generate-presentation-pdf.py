from pathlib import Path
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "apresentacao-gerente-comercial.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

W, H = landscape(A4)
INK = HexColor("#00236A")
MOSS = HexColor("#164B9C")
LIME = HexColor("#FFB000")
ORANGE = HexColor("#FF7B00")
CREAM = HexColor("#F7F8FB")
PALE = HexColor("#EEF3FB")
MUTED = HexColor("#5D6878")
WHITE = HexColor("#FFFFFF")
LOGO = ROOT / "frontend" / "public" / "brand" / "space-sistemas.webp"

regular = Path("C:/Windows/Fonts/arial.ttf")
bold = Path("C:/Windows/Fonts/arialbd.ttf")
pdfmetrics.registerFont(TTFont("GC-Regular", str(regular)))
pdfmetrics.registerFont(TTFont("GC-Bold", str(bold)))

c = canvas.Canvas(str(OUTPUT), pagesize=(W, H), pageCompression=1)
c.setTitle("Gerente Comercial - Apresentação do produto")
c.setAuthor("Gerente Comercial")

def para(text, x, y_top, width, size=15, leading=None, color=MUTED, bold_text=False, align=TA_LEFT):
    style = ParagraphStyle(
        "p", fontName="GC-Bold" if bold_text else "GC-Regular", fontSize=size,
        leading=leading or size * 1.38, textColor=color, alignment=align,
        spaceAfter=0, spaceBefore=0,
    )
    p = Paragraph(text, style)
    _, height = p.wrap(width, H)
    p.drawOn(c, x, y_top - height)
    return height

def label(text, x, y, color=MOSS):
    c.setFont("GC-Bold", 9)
    c.setFillColor(color)
    c.drawString(x, y, text.upper())

def title(text, x, y_top, width, size=36, color=INK):
    return para(text, x, y_top, width, size=size, leading=size * 1.06, color=color, bold_text=True)

def rounded(x, y, w, h, fill, radius=16, stroke=None):
    c.setFillColor(fill)
    c.setStrokeColor(stroke or fill)
    c.roundRect(x, y, w, h, radius, fill=1, stroke=1 if stroke else 0)

def footer(page, dark=False):
    c.setFont("GC-Regular", 8)
    c.setFillColor(HexColor("#B8C9C3") if dark else MUTED)
    c.drawString(42, 22, "SPACE SISTEMAS  |  GERENTE COMERCIAL")
    c.drawRightString(W - 42, 22, f"{page:02d}")

def new_page(bg=CREAM):
    c.setFillColor(bg)
    c.rect(0, 0, W, H, fill=1, stroke=0)

# 1 - Capa
new_page()
for x in range(0, int(W), 48):
    c.setStrokeColor(HexColor("#E4E5D8")); c.line(x, 0, x, H)
for y in range(0, int(H), 48):
    c.setStrokeColor(HexColor("#E4E5D8")); c.line(0, y, W, y)
rounded(46, H - 92, 142, 58, INK, 12)
c.drawImage(str(LOGO), 59, H - 84, width=116, height=44, preserveAspectRatio=True, anchor='c', mask='auto')
label("Decisões comerciais guiadas por dados", 46, H - 118)
title("Sua equipe sabendo<br/>quem procurar, por quê e quando.", 46, H - 148, 510, 48)
para("O Gerente Comercial transforma o histórico de vendas em oportunidades objetivas, organiza a rotina dos vendedores e ajuda a agir antes que bons clientes se afastem.", 48, 210, 480, 16, 23)
rounded(610, 92, 185, 390, INK, 24)
label("VISÃO COMERCIAL", 632, 450, HexColor("#B8C9C3"))
para("O que merece<br/>atenção agora", 632, 424, 140, 20, 23, WHITE, True)
cards = [("OPORTUNIDADES", "24"), ("POTENCIAL", "R$ 86 mil"), ("RECOMPRAS", "11"), ("EM RISCO", "7")]
for i, (lab, val) in enumerate(cards):
    yy = 285 - (i // 2) * 92; xx = 632 + (i % 2) * 78
    rounded(xx, yy, 68, 78, ORANGE if i == 0 else HexColor("#173A78"), 10)
    c.setFont("GC-Regular", 6); c.setFillColor(INK if i == 0 else HexColor("#B8C9C3")); c.drawString(xx + 8, yy + 55, lab)
    c.setFont("GC-Bold", 14); c.setFillColor(INK if i == 0 else WHITE); c.drawString(xx + 8, yy + 25, val)
footer(1)
c.showPage()

# 2 - Proposta de valor
new_page(INK)
label("DA INFORMAÇÃO À AÇÃO", 48, H - 58, LIME)
title("Menos planilhas.<br/>Mais direção comercial.", 48, H - 90, 420, 42, WHITE)
para("A plataforma lê o comportamento real de compra, encontra sinais que se perdem no dia a dia e entrega uma fila de trabalho clara para gestão e vendas.", 48, 325, 400, 16, 24, HexColor("#B8C9C3"))
items = [
    ("01", "BASE CONECTADA", "Vendedores, clientes, vendas, produtos e itens sincronizados com o Sírius."),
    ("02", "VISÃO DA OPERAÇÃO", "Faturamento, ticket médio, clientes ativos e desempenho por período e vendedor."),
    ("03", "OPORTUNIDADES", "Carteira priorizada por urgência e potencial, com justificativa rastreável."),
    ("04", "AGENDA ORIENTADA", "Oportunidades transformadas em contatos dentro da capacidade real da equipe."),
]
for i, (num, head, body) in enumerate(items):
    xx = 500 + (i % 2) * 155; yy = 310 - (i // 2) * 150
    rounded(xx, yy, 140, 130, HexColor("#12366E"), 14)
    c.setFont("GC-Bold", 11); c.setFillColor(LIME); c.drawString(xx + 16, yy + 102, num)
    c.setFont("GC-Bold", 10); c.setFillColor(WHITE); c.drawString(xx + 16, yy + 80, head)
    para(body, xx + 16, yy + 65, 108, 9, 13, HexColor("#B8C9C3"))
footer(2, True)
c.showPage()

# 3 - Análises
new_page()
label("COMO A ANÁLISE FUNCIONA", 48, H - 58)
title("Critérios objetivos.<br/>Recomendações compreensíveis.", 48, H - 90, 520, 38)
para("Os cálculos usam o histórico sincronizado da própria empresa. Cada alerta nasce de padrões mensuráveis.", 48, 380, 500, 15)
analyses = [
    ("01", "Recompra atrasada", "Calcula o intervalo típico entre compras. Quando o cliente ou produto foge do padrão, sinaliza atraso e estima quantidade e valor potencial."),
    ("02", "Cliente em queda", "Compara o desempenho recente com a janela anterior para encontrar uma redução relevante de volume antes que a conta seja perdida."),
    ("03", "Prioridade explicável", "Combina atraso, frequência, valor médio, queda e recorrência em uma pontuação de 0 a 100, sempre acompanhada de justificativa."),
]
for i, (num, head, body) in enumerate(analyses):
    xx = 48 + i * 252
    rounded(xx, 82, 226, 220, WHITE, 16, HexColor("#DADFD7"))
    c.setFont("GC-Bold", 22); c.setFillColor(MOSS); c.drawString(xx + 20, 264, num)
    para(head, xx + 20, 230, 185, 17, 21, INK, True)
    para(body, xx + 20, 183, 185, 11, 16, MUTED)
footer(3)
c.showPage()

# 4 - Fluxo
new_page(PALE)
label("ROTINA COMERCIAL", 48, H - 58)
title("Do dado ao próximo contato.", 48, H - 90, 500, 40)
flow = [
    ("1", "Sincronizar", "O histórico é importado do Sírius sem duplicar registros."),
    ("2", "Analisar", "Padrões de compra, queda e potencial são recalculados."),
    ("3", "Priorizar", "A gestão enxerga o que merece atenção e por qual motivo."),
    ("4", "Agendar", "A equipe recebe uma agenda viável, sem conflito de horários."),
    ("5", "Acompanhar", "Oportunidades e contatos ficam organizados em uma rotina única."),
]
for i, (num, head, body) in enumerate(flow):
    xx = 48 + i * 151
    c.setFillColor(INK); c.circle(xx + 22, 295, 20, fill=1, stroke=0)
    c.setFillColor(LIME); c.setFont("GC-Bold", 14); c.drawCentredString(xx + 22, 290, num)
    if i < len(flow) - 1:
        c.setStrokeColor(MOSS); c.setLineWidth(1.5); c.line(xx + 46, 295, xx + 143, 295)
    para(head, xx, 248, 125, 16, 20, INK, True)
    para(body, xx, 208, 125, 10, 15, MUTED)
rounded(48, 62, W - 96, 58, CREAM, 12)
para("Segurança por desenho: a operação usa uma base local sincronizada; credenciais do Sírius não são expostas ao navegador e a senha da integração não é armazenada.", 66, 101, W - 132, 11, 16, MUTED)
footer(4)
c.showPage()

# 5 - Grupo inicial
new_page()
label("GRUPO INICIAL DE CLIENTES", 48, H - 58)
title("Uma ferramenta construída<br/>com a operação real.", 48, H - 90, 410, 38)
para("O desenvolvimento começa após a formação de um grupo mínimo de 10 clientes com compromisso de aquisição.", 48, 345, 380, 15, 22)
conditions = [
    ("10", "CLIENTES PARA INICIAR", "O ciclo começa quando o grupo mínimo de participantes estiver confirmado."),
    ("A definir", "PRAZO DE DESENVOLVIMENTO", "O cronograma será informado após o fechamento do grupo e a definição do escopo final."),
    ("60 dias", "PARTICIPAÇÃO ASSISTIDA", "Depois da instalação, cada cliente poderá testar e sugerir melhorias com análise mais rápida."),
]
for i, (big, head, body) in enumerate(conditions):
    yy = 345 - i * 112
    rounded(480, yy - 78, 315, 96, PALE, 14)
    para(big, 500, yy, 92, 24, 28, INK, True)
    c.setFont("GC-Bold", 8); c.setFillColor(MOSS); c.drawString(600, yy - 2, head)
    para(body, 600, yy - 16, 170, 9, 13, MUTED)
rounded(48, 78, 380, 125, HexColor("#E9EFF9"), 14)
para("<b>Sobre as sugestões</b><br/>Todas serão avaliadas pelo desenvolvedor quanto à viabilidade, aderência ao produto, segurança e impacto no projeto. Por isso, poderão ou não ser implementadas.", 68, 180, 340, 11, 17, MUTED)
footer(5)
c.showPage()

# 6 - Investimento separado
new_page(INK)
label("CONDIÇÕES COMERCIAIS", 48, H - 58, LIME)
title("Investimento", 48, H - 90, 400, 46, WHITE)
rounded(48, 160, 350, 235, CREAM, 22)
label("AQUISIÇÃO DA PLATAFORMA", 76, 355)
para("R$ 4.863", 76, 320, 280, 42, 46, INK, True)
para("Equivalente a três salários mínimos no valor de referência atual.", 76, 245, 270, 13, 19, MUTED)
rounded(430, 160, 365, 235, HexColor("#12366E"), 22)
label("MANUTENÇÃO MENSAL", 458, 355, HexColor("#B8C9C3"))
para("R$ 40", 458, 320, 290, 42, 46, WHITE, True)
para("por vendedor cadastrado", 458, 245, 280, 14, 20, HexColor("#B8C9C3"))
para("As condições fazem parte da etapa de validação de mercado e devem ser confirmadas na formalização da proposta.", 48, 120, 740, 11, 16, HexColor("#B8C9C3"))
c.drawImage(str(LOGO), W - 172, H - 92, width=120, height=48, preserveAspectRatio=True, anchor='c', mask='auto')
footer(6, True)
c.showPage()

c.save()
print(OUTPUT)
