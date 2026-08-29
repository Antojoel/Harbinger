import os
from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

BASE_DIR = "sample-documents"

def create_doc(filename):
    """Creates a SimpleDocTemplate with uncompressed PDF stream output so all text fields are plain text readable."""
    return SimpleDocTemplate(
        filename,
        pagesize=letter,
        leftMargin=36,
        rightMargin=36,
        topMargin=36,
        bottomMargin=36,
        pageCompression=0
    )

def get_styles():
    styles = getSampleStyleSheet()
    
    primary_color = colors.HexColor("#0f172a")  # Slate 900
    accent_color = colors.HexColor("#1e3a8a")   # Blue 900
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.white,
        alignment=1, # Center
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#475569"),
        alignment=1,
    )
    
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=accent_color,
        spaceAfter=4,
    )
    
    body_bold = ParagraphStyle(
        'BodyBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=primary_color,
    )
    
    body_normal = ParagraphStyle(
        'BodyNormal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#334155"),
    )
    
    table_header = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=colors.white,
        alignment=1,
    )
    
    table_cell = ParagraphStyle(
        'TableCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=12,
        textColor=primary_color,
    )
    
    table_cell_bold = ParagraphStyle(
        'TableCellBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=12,
        textColor=primary_color,
    )

    return {
        'title': title_style,
        'subtitle': subtitle_style,
        'section': section_heading,
        'body_bold': body_bold,
        'body_normal': body_normal,
        'table_header': table_header,
        'table_cell': table_cell,
        'table_cell_bold': table_cell_bold,
    }

def create_banner(title_text, bg_hex="#1e293b"):
    st = get_styles()
    p = Paragraph(title_text.upper(), st['title'])
    t = Table([[p]], colWidths=[540])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor(bg_hex)),
        ('TOPPADDING', (0,0), (-1,-1), 10),
        ('BOTTOMPADDING', (0,0), (-1,-1), 10),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    return t

def make_meta_grid(data_pairs):
    st = get_styles()
    table_data = []
    for label1, val1, label2, val2 in data_pairs:
        row = [
            Paragraph(f"<b>{label1}:</b>", st['body_bold']),
            Paragraph(str(val1), st['body_normal']),
            Paragraph(f"<b>{label2}:</b>", st['body_bold']) if label2 else "",
            Paragraph(str(val2), st['body_normal']) if val2 else ""
        ]
        table_data.append(row)
    
    t = Table(table_data, colWidths=[120, 150, 120, 150])
    t.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('LEFTPADDING', (0,0), (-1,-1), 2),
        ('RIGHTPADDING', (0,0), (-1,-1), 2),
    ]))
    return t


def create_commercial_invoice(filename, inv_no, ref_no, date_str, hs_code, units, total_usd):
    doc = create_doc(filename)
    st = get_styles()
    story = []

    story.append(create_banner("Commercial Invoice", bg_hex="#0f172a"))
    story.append(Spacer(1, 12))

    meta = [
        ("Invoice Number", inv_no, "Invoice Date", date_str),
        ("Shipment Ref", ref_no, "Payment Terms", "Net 30 Days"),
        ("Currency", "USD ($)", "Incoterm", "CIF Hamburg"),
    ]
    story.append(make_meta_grid(meta))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0"), spaceAfter=10))

    # Parties
    parties = [
        [
            Paragraph("<b>EXPORTER / SHIPPER:</b>", st['section']),
            Paragraph("<b>IMPORTER / CONSIGNEE:</b>", st['section'])
        ],
        [
            Paragraph("Shanghai Global Electronics Ltd.<br/>No. 888 Century Avenue, Pudong<br/>Shanghai 200120, China<br/>Tax ID: CN91310000XX778", st['body_normal']),
            Paragraph("Berlin Import & Distribution GmbH<br/>Industriestrasse 42<br/>10115 Berlin, Germany<br/>EORI / Tax ID: DE812345678", st['body_normal'])
        ]
    ]
    t_parties = Table(parties, colWidths=[270, 270])
    t_parties.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_parties)
    story.append(Spacer(1, 14))

    # Line Items Table
    story.append(Paragraph("LINE ITEM DETAILS", st['section']))
    headers = [
        Paragraph("Item", st['table_header']),
        Paragraph("Description of Goods", st['table_header']),
        Paragraph("HS Code", st['table_header']),
        Paragraph("Quantity (Units)", st['table_header']),
        Paragraph("Unit Price", st['table_header']),
        Paragraph("Total (USD)", st['table_header'])
    ]
    
    unit_price = round(total_usd / units, 2)
    
    row = [
        Paragraph("01", st['table_cell']),
        Paragraph("Industrial Power Inverters & Signal Converter Units", st['table_cell']),
        Paragraph(f"<b>{hs_code}</b>", st['table_cell_bold']),
        Paragraph(f"<b>{units}</b>", st['table_cell_bold']),
        Paragraph(f"${unit_price:,.2f}", st['table_cell']),
        Paragraph(f"${total_usd:,.2f}", st['table_cell_bold'])
    ]

    t_items = Table([headers, row], colWidths=[35, 205, 80, 85, 65, 70])
    t_items.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e293b")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_items)
    story.append(Spacer(1, 10))

    # Summary Callout Box
    summary_data = [
        [
            Paragraph("<b>CRITICAL COMPLIANCE DECLARATION:</b>", st['body_bold']),
            Paragraph(f"<b>Declared HS Code:</b> {hs_code}", st['body_normal']),
            Paragraph(f"<b>Total Units:</b> {units}", st['body_normal']),
            Paragraph(f"<b>Total Value:</b> ${total_usd:,.2f} USD", st['body_normal']),
        ]
    ]
    t_summary = Table(summary_data, colWidths=[160, 120, 110, 150])
    t_summary.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f1f5f9")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#0f172a")),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_summary)

    doc.build(story)


def create_packing_list(filename, pl_no, inv_no, ref_no, date_str, hs_code, units, net_kg, gross_kg):
    doc = create_doc(filename)
    st = get_styles()
    story = []

    story.append(create_banner("Packing List", bg_hex="#1e3a8a"))
    story.append(Spacer(1, 12))

    meta = [
        ("Packing List No", pl_no, "Date", date_str),
        ("Invoice Reference", inv_no, "Shipment Ref", ref_no),
        ("Total Packages", "10 Pallets", "Shipping Mode", "Ocean Freight"),
    ]
    story.append(make_meta_grid(meta))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0"), spaceAfter=10))

    # Parties
    parties = [
        [
            Paragraph("<b>EXPORTER / SHIPPER:</b>", st['section']),
            Paragraph("<b>IMPORTER / CONSIGNEE:</b>", st['section'])
        ],
        [
            Paragraph("Shanghai Global Electronics Ltd.<br/>No. 888 Century Avenue, Pudong<br/>Shanghai 200120, China", st['body_normal']),
            Paragraph("Berlin Import & Distribution GmbH<br/>Industriestrasse 42<br/>10115 Berlin, Germany", st['body_normal'])
        ]
    ]
    t_parties = Table(parties, colWidths=[270, 270])
    t_parties.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f8fafc")),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_parties)
    story.append(Spacer(1, 14))

    # Cargo Details Table
    story.append(Paragraph("PACKING SPECIFICATIONS", st['section']))
    headers = [
        Paragraph("Pkg Marks", st['table_header']),
        Paragraph("Description of Goods", st['table_header']),
        Paragraph("HS Code", st['table_header']),
        Paragraph("Quantity (Units)", st['table_header']),
        Paragraph("Net Wt (kg)", st['table_header']),
        Paragraph("Gross Wt (kg)", st['table_header'])
    ]

    row = [
        Paragraph("PLT 1-10", st['table_cell']),
        Paragraph("Industrial Power Inverters & Signal Converters (Boxed)", st['table_cell']),
        Paragraph(f"<b>{hs_code}</b>", st['table_cell_bold']),
        Paragraph(f"<b>{units}</b>", st['table_cell_bold']),
        Paragraph(f"{net_kg:,}", st['table_cell']),
        Paragraph(f"{gross_kg:,}", st['table_cell'])
    ]

    t_items = Table([headers, row], colWidths=[55, 195, 75, 85, 65, 65])
    t_items.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1e3a8a")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_items)
    story.append(Spacer(1, 10))

    # Summary Callout Box
    summary_data = [
        [
            Paragraph("<b>PACKING SUMMARY:</b>", st['body_bold']),
            Paragraph(f"<b>Declared HS Code:</b> {hs_code}", st['body_normal']),
            Paragraph(f"<b>Total Units:</b> {units}", st['body_normal']),
            Paragraph(f"<b>Gross Weight:</b> {gross_kg:,} kg", st['body_normal']),
        ]
    ]
    t_summary = Table(summary_data, colWidths=[140, 130, 120, 150])
    t_summary.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#eff6ff")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#1e3a8a")),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_summary)

    doc.build(story)


def create_bill_of_lading(filename, bl_no, ref_no, date_str, pol, pod, hs_code, gross_kg):
    doc = create_doc(filename)
    st = get_styles()
    story = []

    story.append(create_banner("Ocean Bill of Lading", bg_hex="#0f766e")) # Teal 700
    story.append(Spacer(1, 12))

    meta = [
        ("B/L Number", bl_no, "Container / Booking Ref", ref_no),
        ("Port of Loading", pol, "Port of Discharge", pod),
        ("Vessel / Voyage", "MV Ocean Legend V.2026E", "Date of Issue", date_str),
    ]
    story.append(make_meta_grid(meta))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0"), spaceAfter=10))

    # Parties
    parties = [
        [
            Paragraph("<b>SHIPPER / EXPORTER:</b>", st['section']),
            Paragraph("<b>CONSIGNEE:</b>", st['section'])
        ],
        [
            Paragraph("Shanghai Global Electronics Ltd.<br/>Shanghai, China", st['body_normal']),
            Paragraph("Berlin Import & Distribution GmbH<br/>Berlin, Germany", st['body_normal'])
        ]
    ]
    t_parties = Table(parties, colWidths=[270, 270])
    t_parties.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f0fdfa")),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#99f6e4")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#99f6e4")),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_parties)
    story.append(Spacer(1, 14))

    # Cargo Details Table
    story.append(Paragraph("CARGO MANIFEST & HS DECLARATION", st['section']))
    headers = [
        Paragraph("Container No", st['table_header']),
        Paragraph("Description of Goods", st['table_header']),
        Paragraph("HS Code", st['table_header']),
        Paragraph("Packages", st['table_header']),
        Paragraph("Gross Weight", st['table_header'])
    ]

    row = [
        Paragraph(ref_no, st['table_cell']),
        Paragraph("Industrial Power Inverters & Signal Converters", st['table_cell']),
        Paragraph(f"<b>{hs_code}</b>", st['table_cell_bold']),
        Paragraph("10 Pallets", st['table_cell']),
        Paragraph(f"{gross_kg:,} kg", st['table_cell'])
    ]

    t_items = Table([headers, row], colWidths=[90, 210, 80, 75, 85])
    t_items.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#0f766e")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_items)
    story.append(Spacer(1, 10))

    # Summary Callout Box
    summary_data = [
        [
            Paragraph("<b>CARRIER ROUTE SUMMARY:</b>", st['body_bold']),
            Paragraph(f"<b>HS Code:</b> {hs_code}", st['body_normal']),
            Paragraph(f"<b>Port of Loading:</b> {pol}", st['body_normal']),
            Paragraph(f"<b>Port of Discharge:</b> {pod}", st['body_normal']),
        ]
    ]
    t_summary = Table(summary_data, colWidths=[140, 110, 145, 145])
    t_summary.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#ccfbf1")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#0f766e")),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_summary)

    doc.build(story)


def create_certificate_of_origin(filename, coo_no, ref_no, date_str, origin_country, hs_code, issuing_auth):
    doc = create_doc(filename)
    st = get_styles()
    story = []

    story.append(create_banner("Certificate of Origin", bg_hex="#854d0e")) # Yellow 800
    story.append(Spacer(1, 12))

    meta = [
        ("Certificate No", coo_no, "Date of Issue", date_str),
        ("Shipment Ref", ref_no, "Country of Origin", origin_country),
        ("Issuing Body", issuing_auth, "Status", "Verified & Issued"),
    ]
    story.append(make_meta_grid(meta))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e2e8f0"), spaceAfter=10))

    # Parties
    parties = [
        [
            Paragraph("<b>EXPORTER:</b>", st['section']),
            Paragraph("<b>CONSIGNEE:</b>", st['section'])
        ],
        [
            Paragraph("Shanghai Global Electronics Ltd.<br/>Shanghai, China", st['body_normal']),
            Paragraph("Berlin Import & Distribution GmbH<br/>Berlin, Germany", st['body_normal'])
        ]
    ]
    t_parties = Table(parties, colWidths=[270, 270])
    t_parties.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#fefce8")),
        ('BOX', (0,0), (-1,-1), 0.5, colors.HexColor("#fef08a")),
        ('INNERGRID', (0,0), (-1,-1), 0.5, colors.HexColor("#fef08a")),
        ('PADDING', (0,0), (-1,-1), 8),
    ]))
    story.append(t_parties)
    story.append(Spacer(1, 14))

    # Certification Table
    story.append(Paragraph("GOODS & HS CODE CERTIFICATION", st['section']))
    headers = [
        Paragraph("Item No", st['table_header']),
        Paragraph("Description of Goods", st['table_header']),
        Paragraph("Certified HS Code", st['table_header']),
        Paragraph("Origin Criterion", st['table_header']),
        Paragraph("Country of Origin", st['table_header'])
    ]

    row = [
        Paragraph("01", st['table_cell']),
        Paragraph("Industrial Power Inverters & Signal Converters", st['table_cell']),
        Paragraph(f"<b>{hs_code}</b>", st['table_cell_bold']),
        Paragraph("Wholly Obtained (WO)", st['table_cell']),
        Paragraph(f"<b>{origin_country}</b>", st['table_cell_bold'])
    ]

    t_items = Table([headers, row], colWidths=[55, 205, 105, 95, 80])
    t_items.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#854d0e")),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#cbd5e1")),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))
    story.append(t_items)
    story.append(Spacer(1, 10))

    # Declaration text
    decl_text = (
        f"It is hereby certified that the goods described above comply with the origin rules "
        f"and originate in <b>{origin_country}</b>. Issued under authority of the <b>{issuing_auth}</b>."
    )
    story.append(Paragraph(decl_text, st['body_normal']))
    story.append(Spacer(1, 10))

    # Summary Callout Box
    summary_data = [
        [
            Paragraph("<b>CERTIFIED ORIGIN DETAILS:</b>", st['body_bold']),
            Paragraph(f"<b>HS Code:</b> {hs_code}", st['body_normal']),
            Paragraph(f"<b>Country of Origin:</b> {origin_country}", st['body_normal']),
            Paragraph(f"<b>Issuing Authority:</b> {issuing_auth}", st['body_normal']),
        ]
    ]
    t_summary = Table(summary_data, colWidths=[150, 110, 130, 150])
    t_summary.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#fef9c3")),
        ('BOX', (0,0), (-1,-1), 1, colors.HexColor("#854d0e")),
        ('PADDING', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
    ]))
    story.append(t_summary)

    doc.build(story)


def main():
    date_str = "August 28, 2026"
    pol = "Shanghai Port, China (CNSHA)"
    pod = "Hamburg Port, Germany (DEHAM)"
    issuing_auth = "China Council for Promotion of International Trade (CCPIT)"
    origin_country = "China (CN)"

    # Scenario 1: clean-shipment/
    # HS 8471.30, Invoice units = 250, Packing units = 250, COO present (8471.30)
    sc1 = os.path.join(BASE_DIR, "clean-shipment")
    os.makedirs(sc1, exist_ok=True)
    create_commercial_invoice(os.path.join(sc1, "commercial-invoice.pdf"), "INV-2026-101", "MSKU1234567", date_str, "8471.30", 250, 30000.0)
    create_packing_list(os.path.join(sc1, "packing-list.pdf"), "PL-2026-101", "INV-2026-101", "MSKU1234567", date_str, "8471.30", 250, 1100, 1250)
    create_bill_of_lading(os.path.join(sc1, "bill-of-lading.pdf"), "BL-MSKU-99881", "MSKU1234567", date_str, pol, pod, "8471.30", 1250)
    create_certificate_of_origin(os.path.join(sc1, "certificate-of-origin.pdf"), "COO-CN-2026-7781", "MSKU1234567", date_str, origin_country, "8471.30", issuing_auth)
    print("Generated clean-shipment PDFs")

    # Scenario 2: unit-mismatch/
    # HS 8471.30, Invoice units = 500, Packing units = 480, COO present (8471.30)
    sc2 = os.path.join(BASE_DIR, "unit-mismatch")
    os.makedirs(sc2, exist_ok=True)
    create_commercial_invoice(os.path.join(sc2, "commercial-invoice.pdf"), "INV-2026-102", "MSKU1234568", date_str, "8471.30", 500, 60000.0)
    create_packing_list(os.path.join(sc2, "packing-list.pdf"), "PL-2026-102", "INV-2026-102", "MSKU1234568", date_str, "8471.30", 480, 2100, 2400)
    create_bill_of_lading(os.path.join(sc2, "bill-of-lading.pdf"), "BL-MSKU-99882", "MSKU1234568", date_str, pol, pod, "8471.30", 2400)
    create_certificate_of_origin(os.path.join(sc2, "certificate-of-origin.pdf"), "COO-CN-2026-7782", "MSKU1234568", date_str, origin_country, "8471.30", issuing_auth)
    print("Generated unit-mismatch PDFs")

    # Scenario 3: missing-certificate/
    # HS 8471.30, Invoice units = 300, Packing units = 300, NO COO generated
    sc3 = os.path.join(BASE_DIR, "missing-certificate")
    os.makedirs(sc3, exist_ok=True)
    create_commercial_invoice(os.path.join(sc3, "commercial-invoice.pdf"), "INV-2026-103", "MSKU1234569", date_str, "8471.30", 300, 36000.0)
    create_packing_list(os.path.join(sc3, "packing-list.pdf"), "PL-2026-103", "INV-2026-103", "MSKU1234569", date_str, "8471.30", 300, 1300, 1500)
    create_bill_of_lading(os.path.join(sc3, "bill-of-lading.pdf"), "BL-MSKU-99883", "MSKU1234569", date_str, pol, pod, "8471.30", 1500)
    print("Generated missing-certificate PDFs")

    # Scenario 4: hs-code-mismatch/
    # Invoice HS = 8517.62 (units 220), Packing List HS = 8517.62 (units 220), BL HS = 8471.30, COO HS = 8471.30
    sc4 = os.path.join(BASE_DIR, "hs-code-mismatch")
    os.makedirs(sc4, exist_ok=True)
    create_commercial_invoice(os.path.join(sc4, "commercial-invoice.pdf"), "INV-2026-104", "MSKU1234570", date_str, "8517.62", 220, 26400.0)
    create_packing_list(os.path.join(sc4, "packing-list.pdf"), "PL-2026-104", "INV-2026-104", "MSKU1234570", date_str, "8517.62", 220, 950, 1100)
    create_bill_of_lading(os.path.join(sc4, "bill-of-lading.pdf"), "BL-MSKU-99884", "MSKU1234570", date_str, pol, pod, "8471.30", 1100)
    create_certificate_of_origin(os.path.join(sc4, "certificate-of-origin.pdf"), "COO-CN-2026-7784", "MSKU1234570", date_str, origin_country, "8471.30", issuing_auth)
    print("Generated hs-code-mismatch PDFs")

if __name__ == "__main__":
    main()
