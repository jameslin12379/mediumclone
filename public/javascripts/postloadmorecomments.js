const loadMore = document.querySelector('#loadMore');
const container = document.querySelector('#container');
let url = window.location.pathname;
const lastcharacter = url[url.length-1];
if (lastcharacter === '/'){
    url = url.substring(0, url.length-1);
}
let postid = url.substring(url.lastIndexOf('/')+1);
let count = document.getElementsByClassName('list-item').length;
let total = Number(document.getElementById('commentscount').innerText);
let skip = count;
let loading = false;
const API_URL = window.location.hostname.includes("dev") ? `https://www.vie67.com.dev/api/posts/${postid}/comments` : `https://www.vie67.com/api/posts/${postid}/comments`;

document.addEventListener('scroll', () => {
    const rect = loadMore.getBoundingClientRect();
    if (rect.top < window.innerHeight && !loading) {
        loading = true;
        if (count < total) {
            fetch(API_URL + `?skip=${skip}`).then(response => response.json()).then(result => {
                result = result.results;
                result.forEach(comment => {
                    const div = document.createElement('div');
                    div.classList.add("flex");
                    div.classList.add("mb-50");
                    div.classList.add("list-item");
                    const div2 = document.createElement('div');
                    div2.classList.add("mr-15");
                    div.appendChild(div2);
                    l1 = document.createElement('a');
                    l1.setAttribute("href", `/users/${comment.userid}`);
                    i1 = document.createElement('img');
                    i1.setAttribute("src", comment.imageurl);
                    i1.classList.add('width-60');
                    i1.classList.add('height-60');
                    i1.classList.add('border-radius');
                    l1.appendChild(i1);
                    div2.appendChild(l1);
                    div3 = document.createElement('div');
                    div.appendChild(div3);
                    const div4 = document.createElement('div');
                    l2 = document.createElement('a');
                    l2.setAttribute("href", `/users/${comment.userid}`);
                    l2.innerText = comment.username;
                    l2.classList.add("bold");
                    l2.classList.add("fs-16");
                    div4.appendChild(l2);
                    div3.appendChild(div4);
                    const div5 = document.createElement('div');
                    l3 = document.createElement('a');
                    l3.setAttribute("href", `/comments/${comment.id}`);
                    l3.innerText = comment.description;
                    l3.classList.add("fs-16");
                    div5.appendChild(l3);
                    div3.appendChild(div5);
                    const div6 = document.createElement('div');
                    div6.innerText = moment(comment.datecreated).format('LLL');
                    div6.classList.add("fs-16");
                    div3.appendChild(div6);
                    container.appendChild(div);
                });
                count = document.getElementsByClassName('list-item').length;
                skip = count;
                loading = false;
            });
        }
    }
});


