from setuptools import setup, find_packages

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

# Get version from __version__.py
from hospital_saas import __version__ as version

setup(
    name="hospital_saas",
    version=version,
    description="Multi-Tenant Hospital Management SAAS Platform",
    author="Alexandra Tech Lab",
    author_email="maanindersinghsidhu@gmail.com",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires,
    # Frappe specific
    platforms="all",
    python_requires=">=3.10",
)
