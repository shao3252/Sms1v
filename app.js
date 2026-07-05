// --- CONFIGURATION ---
const SUPABASE_URL = 'https://pnhidxwgbliswgldxkpe.supabase.co';
const SUPABASE_KEY = 'sb_publishable_gTVJUhExideVlDb7AzCcuQ_Oc6u-i-G';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- STATE MANAGEMENT ---
let currentUser = null;
let isSignUp = false;
let currentCategory = 'all';

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

// --- AUTHENTICATION ---
async function handleAuth() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    if(!email || !password) return alert("Please fill in all fields.");

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
        loadUserData();
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
function filterPosts(category, btnElement) {
    currentCategory = category;
    
    // Manage active state of tabs
    const buttons = document.querySelectorAll('.category-tabs button');
    buttons.forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
    
    loadPosts(category);
}

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
    
    if (posts.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:gray; margin-top: 20px;">No messages found.</p>';
        return;
    }

    posts.forEach(post => {
        const isVIP = post.category === 'VIP';
        const profile = post.profiles || {}; 
        const username = profile.username || 'Anonymous';
        const avatar = profile.avatar_url || 'https://via.placeholder.com/40';
        const verifiedBadge = profile.is_verified ? '<i class="fa-solid fa-circle-check verified-badge"></i>' : '';
        const vipBadge = isVIP ? '<i class="fa-solid fa-star vip-badge"></i>' : '';

        const card = document.createElement('div');
        card.className = `post-card ${isVIP ? 'vip-card' : ''}`;
        card.innerHTML = `
            <div class="card-header">
                <img class="avatar-sm" src="${avatar}" alt="${username}">
                <div>
                    <span class="username">${username}</span>
                    ${verifiedBadge}
                    ${vipBadge}
                </div>
            </div>
            <div class="card-body" onclick="${isVIP ? 'showVIPModal()' : ''}">
                ${isVIP ? '<i>********** Premium Message Locked **********</i>' : post.content}
            </div>
            <div class="card-actions">
                <span onclick="likePost(${post.id})"><i class="fa-regular fa-heart"></i> ${post.likes_count || 0}</span>
                <span onclick="copyText('${post.content.replace(/'/g, "\\'")}')"><i class="fa-regular fa-copy"></i></span>
                <span onclick="sharePost(${post.id})"><i class="fa-solid fa-share-nodes"></i></span>
            </div>
        `;
        container.appendChild(card);
    });
}

async function submitPost() {
    const content = document.getElementById('post-text').value;
    const category = document.getElementById('post-category').value;
    
    if (!content) return alert("Message cannot be empty.");

    const { error } = await supabase.from('posts').insert([
        { user_id: currentUser.id, content, category, status: 'approved' }
    ]);
    
    if (!error) {
        document.getElementById('post-text').value = '';
        closeModal('post-modal');
        loadPosts(currentCategory);
    } else {
        alert("Failed to submit post.");
    }
}

async function likePost(postId) {
    // In a real app, track user likes to prevent multi-liking.
    const { data: post } = await supabase.from('posts').select('likes_count').eq('id', postId).single();
    if (post) {
        const newCount = (post.likes_count || 0) + 1;
        await supabase.from('posts').update({ likes_count: newCount }).eq('id', postId);
        loadPosts(currentCategory);
    }
}

function sharePost(postId) {
    const url = window.location.href.split('?')[0] + `?post=${postId}`;
    navigator.clipboard.writeText(url);
    alert("Post link copied to clipboard!");
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
    if (!currentUser) return alert("Please log in to chat.");
    const msg = document.getElementById('chat-input').value;
    if (!msg.trim()) return;
    
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
    if (!currentUser) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    if (data) {
        document.getElementById('profile-username').innerText = data.username || 'User';
        document.getElementById('profile-img').src = data.avatar_url || 'https://via.placeholder.com/100';
        document.getElementById('profile-bio').innerText = data.bio || 'Sweet messages lover.';
        
        if (data.role === 'admin') {
            document.getElementById('admin-entry').classList.remove('hidden');
        }
    }
}

async function uploadAvatar(event) {
    const file = event.target.files[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop();
    const filePath = `${currentUser.id}_${Date.now()}.${fileExt}`;

    let { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true });

    if (!uploadError) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
        await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', currentUser.id);
        loadUserData();
        loadPosts(currentCategory); // refresh posts to show new avatar
    } else {
        alert("Failed to upload avatar.");
    }
}

async function saveProfileChanges() {
    const newUsername = document.getElementById('edit-username').value;
    const newBio = document.getElementById('edit-bio').value;

    const updates = {};
    if (newUsername) updates.username = newUsername;
    if (newBio) updates.bio = newBio;

    const { error } = await supabase.from('profiles').update(updates).eq('id', currentUser.id);
    
    if (!error) {
        loadUserData();
        closeModal('edit-profile-modal');
    }
}

function postAnnouncement() {
    const announcementInput = document.getElementById('admin-announcement');
    const banner = document.getElementById('announcement-banner');
    
    if (announcementInput.value.trim() !== '') {
        banner.innerText = `📢 ${announcementInput.value}`;
        announcementInput.value = '';
        alert('Announcement broadcasted to top feed.');
    }
}

// --- UTILS ---
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function showVIPModal() { openModal('vip-modal'); }
function copyText(txt) { navigator.clipboard.writeText(txt); alert("Message copied to clipboard!"); }
async function logout() { await supabase.auth.signOut(); location.reload(); }
