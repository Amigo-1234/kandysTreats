
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  query,
  orderBy,
  doc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
  const sectionsEl = document.getElementById("menu-sections");
  const itemsEl = document.getElementById("menu-item-list");
  const addSectionBtn = document.getElementById("add-menu-section");
  const addItemBtn = document.getElementById("add-menu-item");
  const titleEl = document.getElementById("active-menu-title");

  const menusRef = collection(window.db, "menus");
  const menusQuery = query(menusRef, orderBy("createdAt", "asc"));
  const orderSound = new Audio("/sounds/order-alert.mp3");
orderSound.volume = 0.9;

  let activeSection = null;
  let menuItems = [];

  


  /* ---------------- LISTEN ---------------- */
  onSnapshot(menusQuery, (snap) => {
    menuItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!activeSection && menuItems.length) {
      activeSection = menuItems[0].section;
      titleEl.textContent = activeSection;
    }

    renderSections();
    renderItems();
  });

  /* ---------------- SECTIONS ---------------- */
  function renderSections() {
    sectionsEl.innerHTML = "";

    const sections = [...new Set(menuItems.map(i => i.section))];

    sections.forEach(section => {
      const btn = document.createElement("button");
      btn.className =
        "menu-section" + (section === activeSection ? " is-active" : "");
      btn.textContent = section;

      btn.onclick = () => {
        activeSection = section;
        titleEl.textContent = section;
        renderSections();
        renderItems();
      };

      sectionsEl.appendChild(btn);
    });
  }

  /* ---------------- ITEMS ---------------- */
  function renderItems() {
    itemsEl.innerHTML = "";

    const items = menuItems.filter(i => i.section === activeSection);

    items.forEach(item => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>
          <input class="name-input" value="${item.name}" />
        </td>

        <td>
          <input type="number" class="price-input" value="${item.price}" />
        </td>

        <td>
          <button class="status-toggle ${
            item.status === "available" ? "on" : "off"
          }">
            ${item.status === "available" ? "Available" : "Sold out"}
          </button>
        </td>

       <td class="actions image-cell">
        <img
          src="${item.image || 'https://via.placeholder.com/80'}"
          class="menu-thumb"
        />

        <input
          type="text"
          class="image-url-input"
          placeholder="Paste image URL here"
          value="${item.image || ''}"
        />

        <button class="btn btn-ghost btn-sm save-btn">Save</button>
        <button class="btn btn-ghost btn-sm delete-btn">🗑️</button>
      </td>


      `;

      const nameInput = tr.querySelector(".name-input");
      const priceInput = tr.querySelector(".price-input");
      const statusBtn = tr.querySelector(".status-toggle");
      const saveBtn = tr.querySelector(".save-btn");
      const deleteBtn = tr.querySelector(".delete-btn");
      const imageInput = tr.querySelector(".image-url-input");
      const imgPreview = tr.querySelector(".menu-thumb");



      let draft = {
      name: item.name,
      price: item.price,
      status: item.status,
      image: item.image || "",
    };



      nameInput.oninput = () => {
        draft.name = nameInput.value.trim();
      };

      priceInput.oninput = () => {
        draft.price = Number(priceInput.value);
      };

      statusBtn.onclick = () => {
        draft.status =
          draft.status === "available" ? "sold-out" : "available";

        statusBtn.textContent =
          draft.status === "available" ? "Available" : "Sold out";

        statusBtn.classList.toggle("on", draft.status === "available");
        statusBtn.classList.toggle("off", draft.status === "sold-out");
      };

        imageInput.oninput = () => {
        const url = imageInput.value.trim();
        if (url.startsWith("http")) {
          imgPreview.src = url;
          draft.image = url;
        }
      };

      imgPreview.onerror = () => {
        imgPreview.src = "https://via.placeholder.com/80";
      }

      saveBtn.onclick = async () => {
        await updateDoc(doc(window.db, "menus", item.id), {
          ...draft,
          updatedAt: serverTimestamp(),
        });

        saveBtn.textContent = "Saved";
        setTimeout(() => (saveBtn.textContent = "Save"), 700);
      };

      deleteBtn.onclick = async () => {
        if (!confirm(`Delete "${item.name}"?`)) return;
        await deleteDoc(doc(window.db, "menus", item.id));
      };

      itemsEl.appendChild(tr);
    });
  }

  /* ---------------- ADD SECTION ---------------- */
  addSectionBtn.onclick = async () => {
    const name = prompt("Menu section name?");
    if (!name) return;

    activeSection = name;
    titleEl.textContent = name;

    const ref = await addDoc(menusRef, {
      name: "New Dish",
      price: 0,
      status: "available",
      section: name,
      image: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(ref, {
      image: `https://picsum.photos/seed/${ref.id}/600/400`,
    });
  };

  /* ---------------- ADD ITEM ---------------- */
  addItemBtn.onclick = async () => {
    if (!activeSection) return;

    const ref = await addDoc(menusRef, {
      name: "New Dish",
      price: 0,
      status: "available",
      section: activeSection,
      image: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    await updateDoc(ref, {
      image: `https://picsum.photos/seed/${ref.id}/600/400`,
    });
  };
});

const qpMenuList = document.getElementById("qp-menu-list");

onSnapshot(collection(db, "menus"), snap => {
  qpMenuList.innerHTML = "";

  snap.forEach(doc => {
    const item = doc.data();

    const row = document.createElement("div");
    row.className = "qp-row";

    row.innerHTML = `
      <label>
        <input type="checkbox" data-id="${doc.id}">
        ${item.name} (₦${item.price})
      </label>
      <input type="number" min="1" value="1" class="qp-qty" />
    `;

    qpMenuList.appendChild(row);
  });
});
const toggleBtns = document.querySelectorAll(".builder-toggle button");
const quickForm = document.getElementById("quick-pick-form");
const menuSection = document.querySelector(".menu-builder");

toggleBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    toggleBtns.forEach(b => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    const mode = btn.dataset.mode;

    if (mode === "quick") {
      quickForm.hidden = false;
      menuSection.style.display = "none";
    } else {
      quickForm.hidden = true;
      menuSection.style.display = "block";
    }
  });
});
document
  .getElementById("quick-pick-form")
  .addEventListener("submit", async e => {
    e.preventDefault();

    const title = qpTitle.value.trim();
    if (!title) return alert("Title required");

    const items = [];

    document.querySelectorAll(".qp-row").forEach(row => {
      const check = row.querySelector("input[type=checkbox]");
      if (!check.checked) return;

      const qty = Number(row.querySelector(".qp-qty").value || 1);

      let BUILDER_MENU_ITEMS = [];

onSnapshot(collection(db, "menus"), snap => {
  BUILDER_MENU_ITEMS = snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));

  qpMenuList.innerHTML = "";

  BUILDER_MENU_ITEMS.forEach(item => {
    const row = document.createElement("div");
    row.className = "qp-row";

    row.innerHTML = `
      <label>
        <input type="checkbox" data-id="${item.id}">
        ${item.name} (₦${item.price})
      </label>
      <input type="number" min="1" value="1" class="qp-qty" />
    `;

    qpMenuList.appendChild(row);
  });
});
     const menuDoc = BUILDER_MENU_ITEMS.find(
  m => m.id === check.dataset.id
);

if (!menuDoc) return;

      items.push({
        menuId: menuDoc.id,
        name: menuDoc.name,
        price: menuDoc.price,
        qty
      });
    });

    if (!items.length) {
      alert("Select at least one food");
      return;
    }

    await addDoc(collection(db, "quickPicks"), {
      title,
      description: qpDesc.value.trim(),
      image: qpImage.value.trim(),
      items,
      active: true,
      priority: Date.now()
    });

    showToast("Quick Pick saved 🎉");
    e.target.reset();
  });

 const qpItems = document.getElementById("qp-items");

if (qpItems) {
  onSnapshot(
    query(collection(db, "quickPicks"), orderBy("priority", "desc")),
    snap => {
      qpItems.innerHTML = "";

      snap.forEach(docSnap => {
        const qp = docSnap.data();

        const row = document.createElement("div");
        row.className = "qp-admin-row";

        row.innerHTML = `
          <div>
            <strong>${qp.title}</strong>
            <div class="muted">${qp.items.length} items</div>
          </div>

          <div class="qp-actions">
            <button class="btn btn-sm ${qp.active ? "btn-primary" : "btn-outline"}">
              ${qp.active ? "Active" : "Hidden"}
            </button>
            <button class="btn btn-ghost btn-sm">🗑️</button>
          </div>
        `;

        // toggle active
        row.querySelector(".btn-primary, .btn-outline").onclick = () => {
          updateDoc(doc(db, "quickPicks", docSnap.id), {
            active: !qp.active
          });
        };

        // delete
        row.querySelector(".btn-ghost").onclick = () => {
          if (!confirm("Delete this quick pick?")) return;
          deleteDoc(doc(db, "quickPicks", docSnap.id));
        };

        qpItems.appendChild(row);
      });
    }
  );
}

function renderExistingQuickPick(id, data) {
  const card = document.createElement("div");
  card.className = "qp-admin-card";

  card.innerHTML = `
    <div class="qp-admin-main">
      <div>
        <strong>${data.title}</strong>
        <p class="muted">${data.description || ""}</p>
        <small>${data.items.length} items</small>
      </div>

      <div class="qp-admin-actions">
        <button class="btn btn-sm ${
          data.active ? "btn-outline" : "btn-primary"
        }">
          ${data.active ? "Disable" : "Enable"}
        </button>
        <button class="btn btn-ghost btn-sm">🗑</button>
      </div>
    </div>
  `;

  const [toggleBtn, deleteBtn] =
    card.querySelectorAll("button");

  // toggle active
  toggleBtn.onclick = async () => {
    await updateDoc(doc(db, "quickPicks", id), {
      active: !data.active
    });
  };

  // delete
  deleteBtn.onclick = async () => {
    if (!confirm(`Delete "${data.title}"?`)) return;
    await deleteDoc(doc(db, "quickPicks", id));
  };

  return card;
}


initExistingQuickPicks();