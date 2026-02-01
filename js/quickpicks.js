import {
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  doc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  // ========= ELEMENTS =========
  const qpForm = document.getElementById("quick-pick-form");
  const qpTitle = document.getElementById("qp-title");
  const qpDesc = document.getElementById("qp-desc");
  const qpImage = document.getElementById("qp-image");
  const qpMenuList = document.getElementById("qp-menu-list");
  const qpItems = document.getElementById("qp-items");
  const showToast = window.showToast;

  if (!qpForm || !qpMenuList) return;

  // ========= LOAD MENU ITEMS =========
  onSnapshot(collection(window.db, "menus"), snap => {
    qpMenuList.innerHTML = "";

    snap.forEach(docSnap => {
      const item = docSnap.data();

      const row = document.createElement("div");
      row.className = "qp-row";

      row.menuItem = {
        id: docSnap.id,
        name: item.name,
        price: item.price
      };

      row.innerHTML = `
        <label>
          <input type="checkbox">
          ${item.name} (₦${item.price})
        </label>
        <input type="number" min="1" value="1" class="qp-qty" />
      `;

      qpMenuList.appendChild(row);
    });
  });

  // ========= SAVE QUICK PICK =========
  qpForm.addEventListener("submit", async e => {
    e.preventDefault();

    const title = qpTitle.value.trim();
    if (!title) {
      alert("Combo name is required");
      return;
    }

    const items = [];

    document.querySelectorAll(".qp-row").forEach(row => {
      const checkbox = row.querySelector("input[type=checkbox]");
      if (!checkbox.checked) return;

      const qty = Number(row.querySelector(".qp-qty").value || 1);
      const item = row.menuItem;

      items.push({
        menuId: item.id,
        name: item.name,
        price: item.price,
        qty
      });
    });

    if (!items.length) {
      alert("Select at least one food");
      return;
    }

    await addDoc(collection(window.db, "quickPicks"), {
      title,
      description: qpDesc.value.trim(),
      image: qpImage.value.trim(),
      items,
      active: true,
      priority: Date.now(),
      createdAt: serverTimestamp()
    });

    qpForm.reset();
    showToast("Quick Pick saved 🎉");
  });

  // ========= EXISTING QUICK PICKS =========
  if (!qpItems) return;

  onSnapshot(
    query(collection(window.db, "quickPicks"), orderBy("priority", "desc")),
    snap => {
      qpItems.innerHTML = "";

      snap.forEach(docSnap => {
        const qp = docSnap.data();

        const card = document.createElement("div");
        card.className = "qp-admin-card";

        card.innerHTML = `
          <div>
            <strong>${qp.title}</strong>
            <div class="muted">${qp.items.length} items</div>
          </div>

          <div class="qp-actions">
            <button class="btn btn-sm ${qp.active ? "btn-primary" : "btn-outline"}">
              ${qp.active ? "Active" : "Hidden"}
            </button>
            <button class="btn btn-ghost btn-sm">🗑</button>
          </div>
        `;

        // toggle active
        card.querySelector(".btn-primary, .btn-outline").onclick = () => {
          updateDoc(doc(window.db, "quickPicks", docSnap.id), {
            active: !qp.active
          });
        };

        // delete
        card.querySelector(".btn-ghost").onclick = () => {
          if (!confirm("Delete this quick pick?")) return;
          deleteDoc(doc(window.db, "quickPicks", docSnap.id));
        };

        qpItems.appendChild(card);
      });
    }
  );
});