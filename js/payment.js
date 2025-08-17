(function () {
  // ensure previous steps
  const dept = localStorage.getItem("selectedDepartment");
  const date = localStorage.getItem("selectedDate");
  const slot = localStorage.getItem("selectedSlot");
  const patient = JSON.parse(localStorage.getItem("patientData") || "{}");

  if (!dept || !date || !slot || !patient.name) {
    alert("Incomplete booking flow. Start again.");
    window.location.href = "availability.html";
  }

  // show summary
  document.getElementById("bookingSummary").innerHTML = `
    <h3>Booking Summary</h3>
    <p><strong>Patient:</strong> ${patient.name} (${patient.age}, ${patient.gender})</p>
    <p><strong>Phone:</strong> ${patient.phone}</p>
    <p><strong>Dept:</strong> ${dept}</p>
    <p><strong>Date:</strong> ${date} • <strong>Slot:</strong> ${slot}</p>
    <p>Amount: <strong>₹10</strong></p>
  `;

  // UI radio show/hide
  document.querySelectorAll('input[name="method"]').forEach(r => {
    r.addEventListener("change", () => {
      document.querySelectorAll(".payment-section").forEach(s => s.classList.add("hidden"));
      if (r.value === "upi") document.getElementById("upiSection").classList.remove("hidden");
      if (r.value === "card") document.getElementById("cardSection").classList.remove("hidden");
      if (r.value === "qr") document.getElementById("qrSection").classList.remove("hidden");
    });
  });

  document.getElementById("backBtn").addEventListener("click", () => window.location.href = "patient-form.html");

  document.getElementById("paymentForm").addEventListener("submit", (e) => {
    e.preventDefault();
    // basic validation
    const method = document.querySelector('input[name="method"]:checked')?.value;
    if (!method) { alert("Choose payment method"); return; }

    // amount in paise
    const amount = 1000; // ₹10
    // Razorpay options
    const options = {
      key: "rzp_test_XXXXXXXX", // <-- replace with your test key
      amount: amount,
      currency: "INR",
      name: "BHU Hospital",
      description: `${dept} OPD Booking`,
      handler: function (response) {
        // response.razorpay_payment_id
        bookAppointment(response.razorpay_payment_id);
      },
      prefill: {
        name: patient.name,
        contact: patient.phone
      },
      theme: { color: "#3399cc" }
    };

    if (method === "qr") {
      // For prototype: user scans QR and if paid, they click "I Paid".
      // but we'll open Razorpay for consistency (test)
      alert("For test flow we'll open Razorpay to simulate payment (choose UPI in popup).");
    }

    const rzp = new Razorpay(options);
    rzp.open();
  });

  async function bookAppointment(paymentId) {
    try {
      // Use transaction to increment token atomically
      const tokenDocId = `${dept}_${date}`; // doc id
      const tokenRef = db.collection("tokens").doc(tokenDocId);

      const newToken = await db.runTransaction(async (t) => {
        const docSnap = await t.get(tokenRef);
        if (!docSnap.exists) {
          t.set(tokenRef, {
            department: dept,
            date: date,
            lastToken: 1,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          return 1;
        } else {
          const last = docSnap.data().lastToken || 0;
          const next = last + 1;
          t.update(tokenRef, {
            lastToken: next,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          return next;
        }
      });

      // store appointment details
      const apptData = {
        name: patient.name,
        age: patient.age,
        gender: patient.gender,
        phone: patient.phone,
        aadhaarMasked: patient.aadhaar, // masked on frontend
        department: dept,
        date: date,
        slot: slot,
        tokenNo: newToken,
        status: "pending",
        paymentStatus: "success",
        razorpayId: paymentId,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      };

      const apptRef = await db.collection("appointments").add(apptData);

      // store for confirmation page
      localStorage.setItem("lastAppointmentId", apptRef.id);
      localStorage.setItem("lastTokenNo", newToken);

      // success redirect
      window.location.href = "js/confirmation.html";

    } catch (err) {
      console.error(err);
      alert("Booking failed: " + err.message);
    }
  }
})();
