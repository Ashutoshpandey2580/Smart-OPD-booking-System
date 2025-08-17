// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.3.0/firebase-app.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  addDoc,
  collection,
  onSnapshot,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.3.0/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyB6SOqgDxiV-Cj_Bw0iW5MOcQ0CcePLlCU",
  authDomain: "YOUR_DOMAIN.firebaseapp.com",
  projectId: "bhu-opd-booking",
  storageBucket: "bhu-opd-booking.appspot.com",
  messagingSenderId: "538229159518",
  appId: "1:538229159518:web:bb9de1dc127687333f66cf"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* ------------------------------------------------------------------
   1) LIVE QUEUE on Home Page (index.html)
   - Reads token doc in real-time and shows current/next token
-------------------------------------------------------------------*/
const currentEl = document.getElementById("currentToken");
const nextEl = document.getElementById("nextToken");

if (currentEl && nextEl) {
  // Dept/Date from localStorage, else defaults
  const dept =
    localStorage.getItem("selectedDepartment") || "General Medicine";
  const date =
    localStorage.getItem("selectedDate") || new Date().toISOString().slice(0, 10);

  const tokenDocRef = doc(db, "tokens", `${dept}_${date}`);

  onSnapshot(tokenDocRef, (snap) => {
    const data = snap.exists() ? snap.data() : {};
    const currentToken = data.currentToken ?? 0;
    const lastToken = data.lastToken ?? 0;

    currentEl.textContent = currentToken;
    nextEl.textContent = currentToken + 1; // Next to be called
  }, (err) => {
    console.error("Queue onSnapshot error:", err);
    currentEl.textContent = "N/A";
    nextEl.textContent = "N/A";
  });
}

/* ------------------------------------------------------------------
   2) BOOKING FLOW (patient-form.html)
   - Form id = bookingForm
   - Razorpay success -> allocate token via Firestore transaction
-------------------------------------------------------------------*/
const bookingForm = document.getElementById("bookingForm");
if (bookingForm) {
  bookingForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name = document.getElementById("name")?.value?.trim();
    const phone = document.getElementById("phone")?.value?.trim();
    const aadhaar = document.getElementById("aadhaar")?.value?.trim();
    const department = document.getElementById("department")?.value;
    const date = document.getElementById("date")?.value;

    if (!name || !phone || !aadhaar || !department || !date) {
      alert("Please fill all required fields.");
      return;
    }

    // 💳 Razorpay Payment Options
    const options = {
      key: "rzp_test_YourKeyHere", // 🔁 Replace with your test key
      amount: 1000,                // ₹10 -> 1000 paisa
      currency: "INR",
      name: "BHU Hospital",
      description: "OPD Booking",
      prefill: {
        name: name,
        email: "example@gmail.com",
        contact: phone
      },
      theme: { color: "#3399cc" },

      handler: async function (response) {
        try {
          // ✅ On Payment Success -> Allocate Token in Transaction
          const tokenId = `${department}_${date}`;
          const tokenDocRef = doc(db, "tokens", tokenId);

          const newToken = await runTransaction(db, async (tx) => {
            const tokenSnap = await tx.get(tokenDocRef);
            let lastToken = 0;
            let currentToken = 0;

            if (tokenSnap.exists()) {
              const d = tokenSnap.data();
              lastToken = d.lastToken || 0;
              currentToken = d.currentToken || 0;
            }

            const assignedToken = lastToken + 1;

            tx.set(
              tokenDocRef,
              {
                department,
                date,
                lastToken: assignedToken,     // incremented
                currentToken: currentToken    // unchanged here
              },
              { merge: true }
            );

            return assignedToken;
          });

          // 💾 Save appointment
          await addDoc(collection(db, "appointments"), {
            name,
            phone,
            aadhaar,
            department,
            date,
            tokenNo: newToken,
            status: "pending",
            paymentStatus: "success",
            razorpayId: response.razorpay_payment_id,
            createdAt: new Date().toISOString()
          });

          // 👉 Redirect or show success
          alert(`✅ Booking Successful! Your Token Number is ${newToken}`);
          localStorage.setItem("lastAssignedToken", newToken);
          window.location.href = "confirmation.html";
        } catch (err) {
          console.error("Error after payment:", err);
          alert("Payment done but saving booking failed. Please contact support.");
        }
      }
    };

    // Open Razorpay
    const rzp = new Razorpay(options);
    rzp.open();
  });
}

/* ------------------------------------------------------------------
   3) (Optional Admin) Increment Current Token Button (for demo)
   - If any page has a button #advanceTokenBtn we advance current token.
-------------------------------------------------------------------*/
const advanceBtn = document.getElementById("advanceTokenBtn");
if (advanceBtn) {
  advanceBtn.addEventListener("click", async () => {
    try {
      const dept =
        localStorage.getItem("selectedDepartment") || "General Medicine";
      const date =
        localStorage.getItem("selectedDate") || new Date().toISOString().slice(0, 10);

      const tokenDocRef = doc(db, "tokens", `${dept}_${date}`);

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(tokenDocRef);
        let current = 0;
        let last = 0;

        if (snap.exists()) {
          current = snap.data().currentToken || 0;
          last = snap.data().lastToken || 0;
        }
        // only advance if current < last
        const nextCurrent = Math.min(current + 1, last);

        tx.set(
          tokenDocRef,
          {
            currentToken: nextCurrent,
            department: dept,
            date: date
          },
          { merge: true }
        );
      });

      alert("✅ Current token advanced!");
    } catch (e) {
      console.error("Advance token error:", e);
      alert("Failed to advance token.");
    }
  });
}
