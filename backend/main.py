from fastapi import FastAPI, Depends, HTTPException, Query, status, Form, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, func
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
import os
import shutil
import json

import models
import schemas
from database import engine, get_db

# Create table payment_certificates if not exists
# Existing vendor_invoices is preserved because it already exists.
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="Payment Processing System API")

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------- Dashboard Endpoint -----------------
@app.get("/api/dashboard/stats", response_model=schemas.DashboardStats)
def get_dashboard_stats(db: Session = Depends(get_db)):
    total_invoices = db.query(models.VendorInvoice).count()
    pending_invoices = db.query(models.VendorInvoice).filter(models.VendorInvoice.status.ilike("Pending")).count()
    approved_invoices = db.query(models.VendorInvoice).filter(models.VendorInvoice.status.ilike("Approved")).count()
    completed_invoices = db.query(models.VendorInvoice).filter(
        or_(models.VendorInvoice.status.ilike("Paid"), models.VendorInvoice.status.ilike("Completed"))
    ).count()
    cancelled_invoices = db.query(models.VendorInvoice).filter(models.VendorInvoice.status.ilike("Cancelled")).count()
    
    total_certificates = db.query(models.PaymentCertificate).count()
    certified_amount_sum = db.query(func.sum(models.PaymentCertificate.amount_certified)).scalar() or Decimal(0.0)
    pending_approvals = db.query(models.PaymentCertificate).filter(
        models.PaymentCertificate.status.ilike("Pending%")
    ).count()
    fully_approved_certs = db.query(models.PaymentCertificate).filter(
        models.PaymentCertificate.status == "Fully Approved"
    ).count()
    
    return {
        "total_invoices": total_invoices,
        "pending_invoices": pending_invoices,
        "approved_invoices": approved_invoices,
        "completed_invoices": completed_invoices,
        "cancelled_invoices": cancelled_invoices,
        "total_certificates": total_certificates,
        "certified_amount_sum": certified_amount_sum,
        "pending_approvals": pending_approvals,
        "fully_approved_certs": fully_approved_certs
    }


import math

# ----------------- Invoice Endpoints -----------------
@app.get("/api/vendors", response_model=List[str])
def get_distinct_vendors(db: Session = Depends(get_db)):
    results = db.query(models.VendorInvoice.vendor_names).distinct().all()
    vendors = [r[0] for r in results if r[0]]
    return sorted(vendors)


@app.get("/api/cost-centers", response_model=List[schemas.CostCenterResponse])
def get_cost_centers(db: Session = Depends(get_db)):
    return db.query(models.CostCenter).all()


@app.get("/api/accounts", response_model=List[schemas.AccountResponse])
def get_accounts(db: Session = Depends(get_db)):
    return db.query(models.Account).all()


@app.get("/api/invoices", response_model=schemas.PaginatedInvoiceResponse)
def get_invoices(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    size: int = Query(5, ge=1, le=10000),
    itd_no: Optional[str] = None,
    vendor_names: Optional[str] = None,
    invoice_took_date: Optional[str] = None,
    invoice_sent: Optional[str] = None,
    cost_center: Optional[str] = None,
    grn_number: Optional[str] = None,
    po_number: Optional[str] = None,
    status: Optional[str] = None,
    payment_type: Optional[str] = None,
    global_search: Optional[str] = None
):
    query = db.query(models.VendorInvoice)
    
    # Column-specific header filters
    if itd_no:
        query = query.filter(models.VendorInvoice.itd_no.ilike(f"%{itd_no}%"))
    if vendor_names:
        # Exact match or case-insensitive match for vendor dropdown selection
        query = query.filter(models.VendorInvoice.vendor_names.ilike(f"{vendor_names}"))
    if invoice_took_date:
        query = query.filter(models.VendorInvoice.invoice_took_date.ilike(f"%{invoice_took_date}%"))
    if invoice_sent:
        query = query.filter(models.VendorInvoice.invoice_sent.ilike(f"%{invoice_sent}%"))
    if cost_center:
        query = query.filter(models.VendorInvoice.cost_center.ilike(f"%{cost_center}%"))
    if grn_number:
        query = query.filter(models.VendorInvoice.grn_number.ilike(f"%{grn_number}%"))
    if po_number:
        query = query.filter(models.VendorInvoice.po_number.ilike(f"%{po_number}%"))
    if status:
        query = query.filter(models.VendorInvoice.status.ilike(f"%{status}%"))
    if payment_type:
        query = query.filter(models.VendorInvoice.payment_type.ilike(f"%{payment_type}%"))
        
    # Global search matching any header column
    if global_search:
        search_filter = or_(
            models.VendorInvoice.itd_no.ilike(f"%{global_search}%"),
            models.VendorInvoice.vendor_names.ilike(f"%{global_search}%"),
            models.VendorInvoice.cost_center.ilike(f"%{global_search}%"),
            models.VendorInvoice.grn_number.ilike(f"%{global_search}%"),
            models.VendorInvoice.po_number.ilike(f"%{global_search}%"),
            models.VendorInvoice.status.ilike(f"%{global_search}%"),
            models.VendorInvoice.payment_type.ilike(f"%{global_search}%"),
            models.VendorInvoice.description.ilike(f"%{global_search}%"),
            models.VendorInvoice.vender_details.ilike(f"%{global_search}%")
        )
        query = query.filter(search_filter)
        
    query = query.order_by(models.VendorInvoice.itd_no.desc())
    total = query.count()
    total_pages = math.ceil(total / size) if total > 0 else 1
    skip = (page - 1) * size
    items = query.offset(skip).limit(size).all()
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "size": size,
        "total_pages": total_pages
    }


def get_next_itd_no(db: Session) -> str:
    all_itds = db.query(models.VendorInvoice.itd_no).all()
    max_num = 1000
    for (itd,) in all_itds:
        if itd and itd.startswith("ITD-"):
            try:
                num = int(itd.split("-")[1])
                if num > max_num:
                    max_num = num
            except (IndexError, ValueError):
                pass
    return f"ITD-{max_num + 1}"


@app.get("/api/invoices/next-itd")
def get_next_itd(db: Session = Depends(get_db)):
    return {"next_itd_no": get_next_itd_no(db)}


@app.get("/api/invoices/{itd_no}", response_model=schemas.VendorInvoiceResponse)
def get_invoice(itd_no: str, db: Session = Depends(get_db)):
    invoice = db.query(models.VendorInvoice).filter(models.VendorInvoice.itd_no == itd_no).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice


@app.get("/api/po-delivery-summary/{po_number}")
def get_po_delivery_summary(po_number: str, db: Session = Depends(get_db)):
    invoices = db.query(models.VendorInvoice).filter(
        models.VendorInvoice.po_number.ilike(po_number.strip()),
        models.VendorInvoice.status != "Cancelled"
    ).all()
    
    total_goods = 0
    total_purchased_goods = 0
    total_spent = Decimal(0.0)
    items = []
    
    for inv in invoices:
        inv_total_goods = inv.total_goods or 0
        if inv_total_goods > total_goods:
            total_goods = inv_total_goods
        
        purchased = inv.purchased_goods or 0
        total_purchased_goods += purchased
        inv_price = inv.price or Decimal(0.0)
        total_spent += inv_price
        
        items.append({
            "itd_no": inv.itd_no,
            "vendor_names": inv.vendor_names,
            "purchased_goods": purchased,
            "total_goods": inv.total_goods,
            "delivered_quantity": purchased,
            "total_po_quantity": inv.total_goods,
            "price": inv_price,
            "status": inv.status,
            "payment_type": inv.payment_type
        })
        
    remaining_goods = max(0, total_goods - total_purchased_goods) if total_goods > 0 else 0
    is_completed = total_goods > 0 and total_purchased_goods >= total_goods
    
    return {
        "po_number": po_number,
        "total_goods": total_goods,
        "purchased_goods": total_purchased_goods,
        "total_purchased_goods": total_purchased_goods,
        "total_po_quantity": total_goods,
        "total_delivered_quantity": total_purchased_goods,
        "remaining_goods": remaining_goods,
        "remaining_quantity": remaining_goods,
        "total_spent": total_spent,
        "is_completed": is_completed,
        "invoices": items
    }


# ----------------- Dynamic Folder Creation Helpers -----------------
PAYMENTS_BASE_PATH = "/Users/rukshandias/Desktop/ProcessAutomation/Payments"

def get_invoice_folder_path(invoice_took_date_str: Optional[str], itd_no: str, vendor_names: Optional[str]) -> str:
    # Use current date as default if date is missing or invalid
    try:
        # Date string might contain time or just be YYYY-MM-DD
        date_str = invoice_took_date_str.split("T")[0] if invoice_took_date_str else ""
        date_obj = datetime.strptime(date_str, "%Y-%m-%d")
    except Exception:
        date_obj = datetime.now()
        
    month_name = date_obj.strftime("%B")  # e.g., "July"
    year_str = date_obj.strftime("%Y")    # e.g., "2026"
    month_folder_name = f"{month_name} {year_str}"
    
    # Sanitize vendor name for safe directory names
    vendor_clean = "Unknown_Vendor"
    if vendor_names:
        vendor_clean = "".join(c for c in vendor_names if c.isalnum() or c in (" ", "-", "_")).strip()
        vendor_clean = " ".join(vendor_clean.split())
        
    subfolder_name = f"{itd_no} - {vendor_clean}"
    return os.path.join(PAYMENTS_BASE_PATH, month_folder_name, subfolder_name)


@app.post("/api/invoices", response_model=schemas.VendorInvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice(
    invoice_data_str: str = Form(...),
    files: List[UploadFile] = File([]),
    db: Session = Depends(get_db)
):
    try:
        invoice_dict = json.loads(invoice_data_str)
        invoice = schemas.VendorInvoiceCreate(**invoice_dict)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid invoice JSON data: {str(e)}")

    invoice_data = invoice.model_dump()
    
    # Validation for Partial Equipment / PO Delivery quantities
    if invoice_data.get("payment_type") == "Partial Equipment / PO Delivery" and invoice_data.get("po_number"):
        po_num = invoice_data["po_number"].strip()
        current_purchased = invoice_data.get("purchased_goods") or invoice_data.get("delivered_quantity") or 0
        req_total_goods = invoice_data.get("total_goods") or invoice_data.get("total_po_quantity")
        
        existing_invoices = db.query(models.VendorInvoice).filter(
            models.VendorInvoice.po_number.ilike(po_num),
            models.VendorInvoice.status != "Cancelled"
        ).all()
        
        previously_purchased = sum((inv.purchased_goods or 0) for inv in existing_invoices)
        
        # Determine total goods limit
        max_goods = req_total_goods
        if not max_goods and existing_invoices:
            for inv in existing_invoices:
                if inv.total_goods:
                    max_goods = inv.total_goods
                    break
                    
        if max_goods is not None and max_goods > 0:
            if previously_purchased >= max_goods:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot create invoice: total_goods limit of {max_goods} items for PO '{po_num}' has already been fully purchased ({previously_purchased} items purchased previously across prior invoices)."
                )
            if (previously_purchased + current_purchased) > max_goods:
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot create invoice: purchased_goods of {current_purchased} items exceeds PO '{po_num}' total_goods limit of {max_goods} items ({previously_purchased} purchased previously + {current_purchased} requested = {previously_purchased + current_purchased} > {max_goods})."
                )
    
    # Auto-generate itd_no if omitted or empty
    if not invoice_data.get("itd_no"):
        invoice_data["itd_no"] = get_next_itd_no(db)
    else:
        existing = db.query(models.VendorInvoice).filter(models.VendorInvoice.itd_no == invoice_data["itd_no"]).first()
        if existing:
            raise HTTPException(status_code=400, detail="Invoice with this ITD Number already exists")
    
    db_invoice = models.VendorInvoice(**invoice_data)
    db.add(db_invoice)
    db.commit()
    db.refresh(db_invoice)

    # Automatically create the folder structure and save files
    folder_path = get_invoice_folder_path(db_invoice.invoice_took_date, db_invoice.itd_no, db_invoice.vendor_names)
    try:
        os.makedirs(folder_path, exist_ok=True)
        for f in files:
            if f.filename:
                filename_clean = os.path.basename(f.filename)
                target_file_path = os.path.join(folder_path, filename_clean)
                with open(target_file_path, "wb") as buffer:
                    shutil.copyfileobj(f.file, buffer)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Invoice saved in database, but failed to create folder structure or save files: {str(e)}"
        )
        
    return db_invoice


@app.put("/api/invoices/{itd_no}", response_model=schemas.VendorInvoiceResponse)
def update_invoice(itd_no: str, invoice_update: schemas.VendorInvoiceUpdate, db: Session = Depends(get_db)):
    db_invoice = db.query(models.VendorInvoice).filter(models.VendorInvoice.itd_no == itd_no).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Update fields
    update_data = invoice_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_invoice, key, value)
        
    db.commit()
    db.refresh(db_invoice)
    return db_invoice


@app.delete("/api/invoices/{itd_no}")
def delete_invoice(itd_no: str, db: Session = Depends(get_db)):
    db_invoice = db.query(models.VendorInvoice).filter(models.VendorInvoice.itd_no == itd_no).first()
    if not db_invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # Get folder path BEFORE deleting from DB to clean up
    folder_path = get_invoice_folder_path(db_invoice.invoice_took_date, db_invoice.itd_no, db_invoice.vendor_names)
    
    # Also delete associated payment certificates to prevent orphan data
    db.query(models.PaymentCertificate).filter(models.PaymentCertificate.itd_no == itd_no).delete()
    
    db.delete(db_invoice)
    db.commit()
    
    # Clean up files on disk if they exist
    if os.path.exists(folder_path):
        try:
            shutil.rmtree(folder_path)
        except Exception:
            pass # Keep it robust even if file deletion fails (e.g. file lock)
            
    return {"detail": "Invoice and associated certificates deleted successfully"}


# ----------------- Document Endpoints -----------------
@app.get("/api/invoices/{itd_no}/documents")
def get_invoice_documents(itd_no: str, db: Session = Depends(get_db)):
    invoice = db.query(models.VendorInvoice).filter(models.VendorInvoice.itd_no == itd_no).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    folder_path = get_invoice_folder_path(invoice.invoice_took_date, invoice.itd_no, invoice.vendor_names)
    if not os.path.exists(folder_path):
        return []
        
    try:
        files = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f))]
        # Exclude hidden files
        files = [f for f in files if not f.startswith(".")]
        return files
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to scan invoice folder: {str(e)}")


@app.get("/api/invoices/{itd_no}/documents/{filename}")
def download_invoice_document(itd_no: str, filename: str, db: Session = Depends(get_db)):
    invoice = db.query(models.VendorInvoice).filter(models.VendorInvoice.itd_no == itd_no).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    folder_path = get_invoice_folder_path(invoice.invoice_took_date, invoice.itd_no, invoice.vendor_names)
    file_path = os.path.join(folder_path, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    return FileResponse(file_path, filename=filename)


@app.post("/api/invoices/{itd_no}/documents")
def upload_more_documents(
    itd_no: str,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    invoice = db.query(models.VendorInvoice).filter(models.VendorInvoice.itd_no == itd_no).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    folder_path = get_invoice_folder_path(invoice.invoice_took_date, invoice.itd_no, invoice.vendor_names)
    os.makedirs(folder_path, exist_ok=True)
    
    saved_files = []
    try:
        for f in files:
            if f.filename:
                filename_clean = os.path.basename(f.filename)
                target_file_path = os.path.join(folder_path, filename_clean)
                with open(target_file_path, "wb") as buffer:
                    shutil.copyfileobj(f.file, buffer)
                saved_files.append(filename_clean)
        return {"detail": "Documents uploaded successfully", "files": saved_files}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload documents: {str(e)}")


@app.delete("/api/invoices/{itd_no}/documents/{filename}")
def delete_invoice_document(itd_no: str, filename: str, db: Session = Depends(get_db)):
    invoice = db.query(models.VendorInvoice).filter(models.VendorInvoice.itd_no == itd_no).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    folder_path = get_invoice_folder_path(invoice.invoice_took_date, invoice.itd_no, invoice.vendor_names)
    file_path = os.path.join(folder_path, filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        os.remove(file_path)
        return {"detail": f"File '{filename}' deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(e)}")


# ----------------- Payment Certificate Endpoints -----------------
@app.get("/api/certificates", response_model=List[schemas.PaymentCertificateResponse])
def get_certificates(db: Session = Depends(get_db)):
    return db.query(models.PaymentCertificate).all()


@app.get("/api/certificates/{certificate_no}", response_model=schemas.PaymentCertificateResponse)
def get_certificate(certificate_no: str, db: Session = Depends(get_db)):
    cert = db.query(models.PaymentCertificate).filter(models.PaymentCertificate.certificate_no == certificate_no).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Payment Certificate not found")
    return cert


@app.post("/api/certificates", response_model=schemas.PaymentCertificateResponse, status_code=status.HTTP_201_CREATED)
def create_certificate(cert_in: schemas.PaymentCertificateCreate, db: Session = Depends(get_db)):
    # Verify invoice exists
    invoice = db.query(models.VendorInvoice).filter(models.VendorInvoice.itd_no == cert_in.itd_no).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Reference Invoice not found")
        
    # Check if certificate for this invoice already exists
    existing = db.query(models.PaymentCertificate).filter(models.PaymentCertificate.itd_no == cert_in.itd_no).first()
    if existing:
        raise HTTPException(
            status_code=400, 
            detail=f"Payment Certificate already exists for this Invoice (Certificate No: {existing.certificate_no})"
        )
        
    # Auto-generate Certificate Number PC-1001, PC-1002, etc.
    # Find max certificate number
    max_no = db.query(func.max(models.PaymentCertificate.certificate_no)).scalar()
    if max_no and max_no.startswith("PC-"):
        try:
            num = int(max_no.split("-")[1])
            new_no = f"PC-{num + 1}"
        except (IndexError, ValueError):
            new_no = f"PC-1001"
    else:
        new_no = "PC-1001"
        
    db_cert = models.PaymentCertificate(
        certificate_no=new_no,
        itd_no=cert_in.itd_no,
        amount_certified=cert_in.amount_certified,
        remarks=cert_in.remarks,
        status="Pending PM Approval"
    )
    
    db.add(db_cert)
    db.commit()
    db.refresh(db_cert)
    return db_cert


@app.post("/api/certificates/{certificate_no}/approve", response_model=schemas.PaymentCertificateResponse)
def approve_certificate(certificate_no: str, approval: schemas.PaymentCertificateApproval, db: Session = Depends(get_db)):
    cert = db.query(models.PaymentCertificate).filter(models.PaymentCertificate.certificate_no == certificate_no).first()
    if not cert:
        raise HTTPException(status_code=404, detail="Payment Certificate not found")
        
    if cert.status in ["Fully Approved", "Rejected"]:
        raise HTTPException(status_code=400, detail=f"Cannot approve/reject a certificate that is already {cert.status}")
        
    role = approval.approver_role.upper()
    act = approval.action.lower()
    
    if act not in ["approve", "reject"]:
        raise HTTPException(status_code=400, detail="Action must be 'approve' or 'reject'")
        
    # Validate approval sequence and execute transition
    if role == "PM":
        # First step
        if cert.approver1_status == "Approved":
            raise HTTPException(status_code=400, detail="Project Manager has already approved this certificate")
        if act == "approve":
            cert.approver1_status = "Approved"
            cert.approver1_date = datetime.utcnow()
            cert.status = "Pending TL Approval"
        else:
            cert.approver1_status = "Rejected"
            cert.approver1_date = datetime.utcnow()
            cert.status = "Rejected"
            
    elif role == "TL":
        # Second step (needs PM approval)
        if cert.approver1_status != "Approved":
            raise HTTPException(status_code=400, detail="Cannot approve: Project Manager approval is pending")
        if cert.approver2_status == "Approved":
            raise HTTPException(status_code=400, detail="Technical Lead has already approved this certificate")
        if act == "approve":
            cert.approver2_status = "Approved"
            cert.approver2_date = datetime.utcnow()
            cert.status = "Pending FC Approval"
        else:
            cert.approver2_status = "Rejected"
            cert.approver2_date = datetime.utcnow()
            cert.status = "Rejected"
            
    elif role == "FC":
        # Third step (needs TL approval)
        if cert.approver2_status != "Approved":
            raise HTTPException(status_code=400, detail="Cannot approve: Technical Lead approval is pending")
        if cert.approver3_status == "Approved":
            raise HTTPException(status_code=400, detail="Financial Controller has already approved this certificate")
        if act == "approve":
            cert.approver3_status = "Approved"
            cert.approver3_date = datetime.utcnow()
            cert.status = "Pending FD Approval"
        else:
            cert.approver3_status = "Rejected"
            cert.approver3_date = datetime.utcnow()
            cert.status = "Rejected"
            
    elif role == "FD":
        # Fourth step (needs FC approval)
        if cert.approver3_status != "Approved":
            raise HTTPException(status_code=400, detail="Cannot approve: Financial Controller approval is pending")
        if cert.approver4_status == "Approved":
            raise HTTPException(status_code=400, detail="Finance Director has already approved this certificate")
        if act == "approve":
            cert.approver4_status = "Approved"
            cert.approver4_date = datetime.utcnow()
            cert.status = "Fully Approved"
            
            # Automatically update the original invoice status to "Paid"
            invoice = db.query(models.VendorInvoice).filter(models.VendorInvoice.itd_no == cert.itd_no).first()
            if invoice:
                invoice.status = "Paid"
        else:
            cert.approver4_status = "Rejected"
            cert.approver4_date = datetime.utcnow()
            cert.status = "Rejected"
    else:
        raise HTTPException(status_code=400, detail="Invalid approver role. Must be 'PM', 'TL', 'FC', or 'FD'")
        
    # Append remarks if provided
    if approval.remarks:
        timestamp = datetime.utcnow().strftime("%Y-%m-%d %H:%M")
        role_label = {
            "PM": "Project Manager",
            "TL": "Technical Lead",
            "FC": "Financial Controller",
            "FD": "Finance Director"
        }.get(role, role)
        
        new_remark = f"[{timestamp}] {role_label} ({act.capitalize()}d): {approval.remarks}"
        if cert.remarks:
            cert.remarks = cert.remarks + "\n" + new_remark
        else:
            cert.remarks = new_remark
            
    db.commit()
    db.refresh(cert)
    return cert


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
