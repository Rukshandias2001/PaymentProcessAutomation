from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime
from decimal import Decimal

# Invoice schemas
class VendorInvoiceBase(BaseModel):
    vendor_names: Optional[str] = None
    invoice_took_date: Optional[str] = None
    invoice_sent: Optional[str] = None
    cost_center: Optional[str] = None
    grn_number: Optional[str] = None
    description: Optional[str] = None
    po_number: Optional[str] = None
    status: Optional[str] = "Pending"
    payment_type: Optional[str] = None
    price: Optional[Decimal] = None
    total_goods: Optional[int] = None
    purchased_goods: Optional[int] = None
    vender_details: Optional[str] = None
    cost_center_id: Optional[int] = None
    cost_center_name: Optional[str] = None
    cost_center_type: Optional[str] = None
    account_id: Optional[int] = None
    account_number: Optional[str] = None
    account_type: Optional[str] = None

class CostCenterResponse(BaseModel):
    cost_center_id: int
    cost_center_code: str
    cost_center_name: str
    cost_center_type: str
    
    model_config = ConfigDict(from_attributes=True)

class AccountResponse(BaseModel):
    account_id: int
    account_number: str
    account_name: str
    account_type: str
    
    model_config = ConfigDict(from_attributes=True)

class VendorInvoiceCreate(VendorInvoiceBase):
    itd_no: Optional[str] = None

class VendorInvoiceUpdate(VendorInvoiceBase):
    pass

class VendorInvoiceResponse(VendorInvoiceBase):
    itd_no: str
    
    model_config = ConfigDict(from_attributes=True)

class PaginatedInvoiceResponse(BaseModel):
    items: List[VendorInvoiceResponse]
    total: int
    page: int
    size: int
    total_pages: int

# Certificate schemas
class PaymentCertificateBase(BaseModel):
    itd_no: str
    amount_certified: Decimal
    remarks: Optional[str] = None

class PaymentCertificateCreate(PaymentCertificateBase):
    pass

class PaymentCertificateApproval(BaseModel):
    approver_role: str  # "PM", "TL", "FC", "FD"
    action: str        # "approve", "reject"
    remarks: Optional[str] = None

class PaymentCertificateResponse(BaseModel):
    certificate_no: str
    itd_no: str
    amount_certified: Decimal
    status: str
    
    approver1_status: str
    approver1_name: str
    approver1_date: Optional[datetime] = None
    
    approver2_status: str
    approver2_name: str
    approver2_date: Optional[datetime] = None
    
    approver3_status: str
    approver3_name: str
    approver3_date: Optional[datetime] = None
    
    approver4_status: str
    approver4_name: str
    approver4_date: Optional[datetime] = None
    
    remarks: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    invoice: Optional[VendorInvoiceResponse] = None

    model_config = ConfigDict(from_attributes=True)

# Dashboard Stats schema
class DashboardStats(BaseModel):
    total_invoices: int
    pending_invoices: int
    approved_invoices: int
    completed_invoices: int
    cancelled_invoices: int
    total_certificates: int
    certified_amount_sum: Decimal
    pending_approvals: int
    fully_approved_certs: int
