
import os
from datetime import datetime, timezone

import streamlit as st
from pymongo import MongoClient
from pymongo.errors import PyMongoError

st.set_page_config(
    page_title="My Blog",
    page_icon="📝",
    layout="wide",
)

st.markdown(
    """
    <style>
    .main-title {
        font-size: 42px;
        font-weight: 800;
        text-align: center;
        color: #5B5FEF;
    }
    .subtitle {
        text-align: center;
        color: #777;
        margin-bottom: 25px;
    }
    </style>
    """,
    unsafe_allow_html=True,
)

st.markdown('<div class="main-title">📝 My Blog</div>',
            unsafe_allow_html=True)
st.markdown(
    '<div class="subtitle">Share your thoughts with the world.</div>',
    unsafe_allow_html=True,
)

@st.cache_resource
def get_collection():
    uri = st.secrets.get(
        "MONGODB_URI",
        os.getenv("MONGODB_URI", "")
    )
    if not uri:
        return None

    client = MongoClient(uri, serverSelectionTimeoutMS=5000)
    client.admin.command("ping")
    database = client["blog_database"]
    return database["posts"]


def get_posts(collection):
    return list(collection.find().sort("created_at", -1))


def main():
    try:
        collection = get_collection()
    except (PyMongoError, ValueError) as error:
        st.error("Could not connect to MongoDB. Check your connection settings.")
        st.caption(str(error))
        st.stop()

    if collection is None:
        st.warning(
            "MongoDB is not configured yet. Add MONGODB_URI "
            "in Streamlit App Settings → Secrets."
        )
        st.stop()

    create_tab, posts_tab = st.tabs(["✍️ Create a post", "📚 All posts"])

    with create_tab:
        with st.form("create_post", clear_on_submit=True):
            title = st.text_input("Post title", max_chars=150)
            author = st.text_input("Your name", max_chars=80)
            content = st.text_area("Write your blog post", height=220)
            submitted = st.form_submit_button(
                "Publish post",
                type="primary",
                use_container_width=True,
            )

            if submitted:
                if not title.strip() or not author.strip() or not content.strip():
                    st.warning("Please fill in the title, name, and content.")
                else:
                    post = {
                        "title": title.strip(),
                        "author": author.strip(),
                        "content": content.strip(),
                        "created_at": datetime.now(timezone.utc),
                    }
                    try:
                        collection.insert_one(post)
                        st.success("Your blog post was published!")
                        st.rerun()
                    except PyMongoError:
                        st.error("Could not publish the post. Please try again.")

    with posts_tab:
        try:
            posts = get_posts(collection)
        except PyMongoError:
            st.error("Could not load posts from MongoDB.")
            return

        if not posts:
            st.info("No posts yet. Create the first blog post!")
        else:
            st.write(f"**{len(posts)} blog post(s)**")

            for post in posts:
                post_id = str(post["_id"])
                with st.container(border=True):
                    st.subheader(post.get("title", "Untitled"))
                    st.caption(
                        f"By {post.get('author', 'Unknown')} · "
                        f"{post.get('created_at', '').strftime('%d %b %Y')}"
                        if isinstance(post.get("created_at"), datetime)
                        else f"By {post.get('author', 'Unknown')}"
                    )
                    st.write(post.get("content", ""))

                    with st.expander("Post options"):
                        confirm = st.checkbox(
                            "I want to delete this post",
                            key=f"confirm_{post_id}",
                        )
                        if st.button(
                            "Delete post",
                            key=f"delete_{post_id}",
                            disabled=not confirm,
                        ):
                            try:
                                collection.delete_one({"_id": post["_id"]})
                                st.success("Post deleted.")
                                st.rerun()
                            except PyMongoError:
                                st.error("Could not delete the post.")


main()
