
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

        <td class="actions">
          <button class="btn btn-ghost btn-sm save-btn">Save</button>
          <button class="btn btn-ghost btn-sm delete-btn">🗑️</button>
        </td>
      `;

      const nameInput = tr.querySelector(".name-input");
      const priceInput = tr.querySelector(".price-input");
      const statusBtn = tr.querySelector(".status-toggle");
      const saveBtn = tr.querySelector(".save-btn");
      const deleteBtn = tr.querySelector(".delete-btn");

      let draft = {
        name: item.name,
        price: item.price,
        status: item.status,
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
