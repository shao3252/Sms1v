// --- CONFIGURATION ---
const SUPABASE_URL = 'https://pnhidxwgbliswgldxkpe.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gTVJUhExideVlDb7AzCcuQ_Oc6u-i-G';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- STATE MANAGEMENT ---
let currentLang = 'en';
let currentUser = null;
let isSignUp = false;

const i18n = {
    en: {
        getStarted: "Get Started",
        login: "Login",
        signup: "Sign Up",
        feedTitle: "Sms Tamu",
        postBtn: "Post",
        langBtn: "SW"
    },
    sw: {
        getStarted: "Anza Sasa",
        login: "Ingia",
        signup: "Jisajili",
        feedTitle: "Sms Tamu",
        postBtn: "Tuma",
        langBtn: "EN"
    }
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        currentUser = session.user;
        loadUserData();
        showSection('home-screen');
    }
    initChatListener();
    loadPosts();
});

// --- UI ROUTING ---
function showSection(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
    
    // Toggle Bottom Nav Visibility
    const nav = document.getElementById('bottom-nav');
    if (id === 'landing-screen' || id === 'auth-screen') {
        nav.classList.add('hidden');
    } else {
        nav.classList.remove('hidden');
    }
}

// --- LANGUAGE LOGIC ---
function toggleLanguage() {
    currentLang = currentLang === 'en' ? 'sw' : 'en';
    document.getElementById('langBtn').innerText = i18n[currentLang].langBtn;
    
    document.querySelectorAll('.i18n').forEach(el => {
        el.innerText = el.getAttribute(`data-${currentLang}`);
    });
}

// --- AUTHENTICATION ---
async function handleAuth() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    try {
        let result;
        if (isSignUp) {
            result = await supabase.auth.signUp({ email, password });
            if (result.data.user) {
                // Create initial profile
                await supabase.from('profiles').insert([
                    { id: result.data.user.id, username: email.split('@')[0], role: 'user' }
                ]);
            }
        } else {
            result = await supabase.auth.signInWithPassword({ email, password });
        }

        if (result.error) throw result.error;
        currentUser = result.data.user;
        showSection('home-screen');
    } catch (err) {
        alert(err.message);
    }
}

function toggleAuthMode() {
    isSignUp = !isSignUp;
    document.getElementById('auth-title').innerText = isSignUp ? "Sign Up" : "Login";
    document.getElementById('auth-toggle').innerText = isSignUp ? "Already have an account? Login" : "Don't have an account? Sign Up";
}

// --- POSTS CRUD ---
async function loadPosts(category = 'all') {
    let query = supabase.from('posts').select(`*, profiles(username, avatar_url, is_verified, role)`).eq('status', 'approved');
    
    if (category !== 'all') {
        query = query.eq('category', category);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
    
    if (error) return console.error(error);
    renderPosts(data);
}

function renderPosts(posts) {
    const container = document.getElementById('posts-feed');
    container.innerHTML = '';
    
    posts.forEach(post => {
        const isVIP = post.category === 'VIP';
        const card = document.createElement('div');
        card.className = `post-card ${isVIP ? 'vip-card' : ''}`;
        card.innerHTML = `
            <div class="card-header">
                <img class="avatar-sm" src="${post.profiles.avatar_url || 'https://via.placeholder.com/40'}">
                <div>
                    <span class="username">${post.profiles.username}</span>
                    ${post.profiles.is_verified ? '<i class="fa-solid fa-circle-check verified-badge"></i>' : ''}
                    ${isVIP ? '<i class="fa-solid fa-star vip-badge"></i>' : ''}
                </div>
            </div>
            <div class="card-body" onclick="${isVIP ? 'showVIPModal()' : ''}">
                ${isVIP ? '<i>********** Message Kuntu Locked **********</i>' : post.content}
            </div>
            <div class="card-actions">
                <span onclick="likePost(${post.id})"><i class="fa-regular fa-heart"></i> ${post.likes_count}</span>
                <span onclick="copyText('${post.content}')"><i class="fa-regular fa-copy"></i></span>
                <span onclick="sharePost(${post.id})"><i class="fa-solid fa-share-nodes"></i></span>
            </div>
        `;
        container.appendChild(card);
    });
}

async function submitPost() {
    const content = document.getElementById('post-text').value;
    const category = document.getElementById('post-category').value;
    
    const { error } = await supabase.from('posts').insert([
        { user_id: currentUser.id, content, category, status: 'approved' }
    ]);
    
    if (!error) {
        closeModal('post-modal');
        loadPosts();
    }
}

// --- GLOBAL CHAT ---
async function initChatListener() {
    supabase.channel('public:global_chat')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'global_chat' }, payload => {
        appendChatMessage(payload.new);
    })
    .subscribe();
}

async function sendChatMessage() {
    const msg = document.getElementById('chat-input').value;
    if (!msg) return;
    
    await supabase.from('global_chat').insert([{ user_id: currentUser.id, message: msg }]);
    document.getElementById('chat-input').value = '';
}

function appendChatMessage(data) {
    const chatBox = document.getElementById('chat-messages');
    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg';
    msgEl.innerText = data.message;
    chatBox.appendChild(msgEl);
    chatBox.scrollTop = chatBox.scrollHeight;
}

// --- PROFILE & ADMIN ---
async function loadUserData() {
    const { data } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) {
        document.getElementById('profile-username').innerText = data.username;
        document.getElementById('profile-img').src = data.avatar_url || 'https://via.placeholder.com/100';
        if (data.role === 'admin') document.getElementById('admin-entry').classList.remove('hidden');
    }
}

async function uploadAvatar(event) {
    const file = event.target.files[0];
    const fileExt = file.name.split('.').pop();
    const filePath = `${currentUser.id}.${fileExt}`;

    let { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });

    if (!uploadError) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
        await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', currentUser.id);
        loadUserData();
    }
}

// --- UTILS ---
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function showVIPModal() { openModal('vip-modal'); }
function copyText(txt) { navigator.clipboard.writeText(txt); alert("Copied!"); }
async function logout() { await supabase.auth.signOut(); location.reload(); }
