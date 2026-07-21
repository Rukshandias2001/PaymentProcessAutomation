import urllib.request
import urllib.parse
import json
import mimetypes
import time

BASE_URL = "http://127.0.0.1:8000/api"

def make_request(url, method="GET", data=None, headers=None, files=None):
    if headers is None:
        headers = {}
    
    req_data = None
    if files:
        # Multipart form data encoding for file upload
        boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
        body = []
        for field, (filename, content) in files.items():
            body.append(f"--{boundary}".encode())
            body.append(f'Content-Disposition: form-data; name="{field}"; filename="{filename}"'.encode())
            body.append(b"Content-Type: text/plain")
            body.append(b"")
            body.append(content.encode() if isinstance(content, str) else content)
        body.append(f"--{boundary}--".encode())
        body.append(b"")
        req_data = b"\r\n".join(body)
    elif data is not None:
        if headers.get("Content-Type") == "application/x-www-form-urlencoded":
            req_data = urllib.parse.urlencode(data).encode("utf-8")
        else:
            req_data = json.dumps(data).encode("utf-8")
            headers["Content-Type"] = "application/json"
            
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            res_body = response.read().decode("utf-8")
            return response.status, json.loads(res_body) if res_body else {}
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8")
        try:
            err_json = json.loads(err_body)
        except Exception:
            err_json = {"detail": err_body}
        return e.code, err_json

def run_tests():
    print("==================================================")
    print("   🧪  STARTING AUTHENTICATION & WORKFLOW TESTS   ")
    print("==================================================")
    
    # 1. Login helper
    def login(username):
        code, data = make_request(f"{BASE_URL}/auth/login", method="POST", data={
            "username": username,
            "password": "password"
        })
        assert code == 200, f"Login failed for {username}: {data}"
        print(f"✅ Logged in as {username} ({data['user']['role']})")
        return data["token"]
        
    # Get tokens
    manager_token = login("manager")
    seniormanager_token = login("seniormanager")
    headofit_token = login("headofit")
    dgm_token = login("dgm")
    accounts_token = login("accounts")
    
    # 2. Test creation authorization
    # Trying to create invoice with seniormanager token (should fail)
    bad_headers = {"Authorization": f"Bearer {seniormanager_token}"}
    unique_id = int(time.time())
    create_payload = {
        "invoice_number": f"INV-AUTH-{unique_id}",
        "vendor_names": "Auth Test Vendor",
        "invoice_took_date": "2026-07-21",
        "invoice_sent": "2026-07-21",
        "cost_center_id": 1,
        "account_id": 1,
        "payment_type": "Computer Software Purchases",
        "grn_number": f"GRN-AUTH-{unique_id}",
        "price": 12500.00,
        "description": "Test authentication constraints",
    }
    
    # Prepare URL-encoded form data since FastAPI expects Form parameters for creating invoices
    form_data = {"invoice_data_str": json.dumps(create_payload)}
    
    # We do a POST request using Form urlencoding
    url_headers = bad_headers.copy()
    url_headers["Content-Type"] = "application/x-www-form-urlencoded"
    
    code, data = make_request(
        f"{BASE_URL}/invoices",
        method="POST",
        data=form_data,
        headers=url_headers
    )
    assert code == 403, f"Non-manager was allowed to create an invoice! {code} - {data}"
    print("✅ Verified non-manager cannot create invoices (403 Forbidden)")
    
    # Create with manager token (should succeed)
    mgr_headers = {"Authorization": f"Bearer {manager_token}"}
    mgr_url_headers = mgr_headers.copy()
    mgr_url_headers["Content-Type"] = "application/x-www-form-urlencoded"
    
    code, data = make_request(
        f"{BASE_URL}/invoices",
        method="POST",
        data=form_data,
        headers=mgr_url_headers
    )
    assert code == 201, f"Manager failed to create invoice: {code} - {data}"
    invoice = data
    itd_no = invoice["itd_no"]
    print(f"✅ Created invoice {itd_no} as Manager. Initial status: {invoice['status']}, current_approver: {invoice['current_approver']}")
    assert invoice["status"] == "Pending"
    assert invoice["current_approver"] == "Manager"
    
    # 3. Manager correct invoice (should succeed because status is Pending)
    correct_payload = create_payload.copy()
    correct_payload["price"] = 15000.00  # Correct price
    code, data = make_request(
        f"{BASE_URL}/invoices/{itd_no}/correct",
        method="PUT",
        data=correct_payload,
        headers=mgr_headers
    )
    assert code == 200, f"Manager failed to correct invoice: {code} - {data}"
    invoice = data
    assert float(invoice["price"]) == 15000.00
    print("✅ Verified Manager can make corrections in Pending stage.")
    
    # 4. Attach document to move it to Signature Pending
    dummy_files = {"files": ("test_doc.txt", "dummy document content")}
    code, data = make_request(
        f"{BASE_URL}/invoices/{itd_no}/documents",
        method="POST",
        headers=mgr_headers,
        files=dummy_files
    )
    assert code == 200, f"Failed to upload document: {code} - {data}"
    code, invoice = make_request(f"{BASE_URL}/invoices/{itd_no}", method="GET", headers=mgr_headers)
    assert code == 200, f"Failed to retrieve updated invoice: {code} - {invoice}"
    assert invoice["status"] == "Signature Pending"
    assert invoice["current_approver"] == "Senior Manager IT Operations"
    print(f"✅ Document uploaded. Status moved to: {invoice['status']}, owner: {invoice['current_approver']}")
    
    # 5. Non-active approver try to approve/reject (should fail)
    code, data = make_request(f"{BASE_URL}/invoices/{itd_no}/approve", method="POST", headers=mgr_headers)
    assert code == 403, f"Manager approved invoice while current approver is Senior Manager! {code} - {data}"
    print("✅ Verified non-active approver cannot approve (403 Forbidden)")
    
    # Active approver approves (Senior Manager IT Operations)
    sm_headers = {"Authorization": f"Bearer {seniormanager_token}"}
    code, data = make_request(f"{BASE_URL}/invoices/{itd_no}/approve", method="POST", headers=sm_headers)
    assert code == 200, f"Senior Manager failed to approve: {code} - {data}"
    invoice = data
    assert invoice["status"] == "Signature Pending"
    assert invoice["current_approver"] == "Head of IT"
    print(f"✅ Senior Manager approved. Stage moved to: {invoice['status']}, owner: {invoice['current_approver']}")
    
    # 6. Rejection workflow: Head of IT rejects the invoice
    hi_headers = {"Authorization": f"Bearer {headofit_token}"}
    code, data = make_request(f"{BASE_URL}/invoices/{itd_no}/reject", method="POST", headers=hi_headers)
    assert code == 200, f"Head of IT failed to reject: {code} - {data}"
    invoice = data
    assert invoice["status"] == "Pending"
    assert invoice["current_approver"] == "Manager"
    print(f"✅ Head of IT rejected invoice. Workflow successfully reset to status: {invoice['status']}, owner: {invoice['current_approver']}")
    
    # 7. Cancel invoice by Manager
    code, data = make_request(f"{BASE_URL}/invoices/{itd_no}/cancel", method="POST", headers=mgr_headers)
    assert code == 200, f"Manager failed to cancel invoice: {code} - {data}"
    invoice = data
    assert invoice["status"] == "Cancelled"
    assert invoice["current_approver"] is None
    print(f"✅ Manager successfully cancelled the invoice. Status: {invoice['status']}")
    
    # Cleanup: Delete test invoice
    code, data = make_request(f"{BASE_URL}/invoices/{itd_no}", method="DELETE", headers=mgr_headers)
    assert code == 200, f"Failed to clean up test invoice: {code} - {data}"
    print("✅ Cleanup completed successfully.")
    
    print("\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉")

if __name__ == "__main__":
    run_tests()
