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

  if (!sectionsEl || !itemsEl) return;

  const menusRef = collection(window.db, "menus");
  const menusQuery = query(menusRef, orderBy("createdAt", "asc"));

  let activeSection = null;
  let menuItems = [];

  onSnapshot(menusQuery, (snap) => {
    menuItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (!activeSection && menuItems.length) {
      activeSection = menuItems[0].section;
      titleEl.textContent = activeSection;
    }

    renderSections();
    renderItems();
  });

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

  function renderItems() {
    itemsEl.innerHTML = "";
    const items = menuItems.filter(i => i.section === activeSection);

    items.forEach(item => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input value="${item.name}" class="name-input"></td>
        <td><input type="number" value="${item.price}" class="price-input"></td>
        <td>
          <button class="status-toggle ${item.status === "available" ? "on" : "off"}">
            ${item.status === "available" ? "Available" : "Sold out"}
          </button>
        </td>
        <td>
          <button class="btn btn-sm save-btn">Save</button>
          <button class="btn btn-sm delete-btn">🗑️</button>
        </td>
      `;

      const nameInput = tr.querySelector(".name-input");
      const priceInput = tr.querySelector(".price-input");
      const statusBtn = tr.querySelector(".status-toggle");

      let draft = { ...item };

      nameInput.oninput = () => draft.name = nameInput.value.trim();
      priceInput.oninput = () => draft.price = Number(priceInput.value);

      statusBtn.onclick = () => {
        draft.status = draft.status === "available" ? "sold-out" : "available";
        statusBtn.textContent =
          draft.status === "available" ? "Available" : "Sold out";
        statusBtn.classList.toggle("on");
        statusBtn.classList.toggle("off");
      };

      tr.querySelector(".save-btn").onclick = async () => {
        await updateDoc(doc(window.db, "menus", item.id), {
          name: draft.name,
          price: draft.price,
          status: draft.status,
          updatedAt: serverTimestamp()
        });
      };

      tr.querySelector(".delete-btn").onclick = async () => {
        if (!confirm(`Delete ${item.name}?`)) return;
        await deleteDoc(doc(window.db, "menus", item.id));
      };

      itemsEl.appendChild(tr);
    });
  }

  addSectionBtn.onclick = async () => {
    const name = prompt("Menu section name?");
    if (!name) return;

    activeSection = name;
    titleEl.textContent = name;

    await addDoc(menusRef, {
      name: "New Dish",
      price: 0,
      status: "available",
      section: name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  };

  addItemBtn.onclick = async () => {
    if (!activeSection) return;

    await addDoc(menusRef, {
      name: "New Dish",
      price: 0,
      status: "available",
      section: activeSection,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  };
});