"""
One paginator for every list in the API.

DRF's stock PageNumberPagination ignores ?page_size= unless page_size_query_param
is set, so the app's "page_size=200" requests were quietly getting 50 rows back:
the platform list stopped at 50 workspaces and nobody would have noticed until
the 51st client. This one honours page_size up to a ceiling, and tells the page
how many pages there are so the pager can draw itself without doing arithmetic.
"""

from rest_framework.exceptions import NotFound
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class Pages(PageNumberPagination):
    page_size = 50
    page_size_query_param = "page_size"
    max_page_size = 200

    def paginate_queryset(self, queryset, request, view=None):
        try:
            return super().paginate_queryset(queryset, request, view)
        except NotFound:
            # A page past the end (rows were removed since the page was opened, or a
            # filter changed): show the last page rather than an error.
            paginator = self.django_paginator_class(queryset, self.get_page_size(request))
            self.request = request
            self.page = paginator.page(paginator.num_pages)
            return list(self.page)

    def get_paginated_response(self, data):
        return Response({
            "count": self.page.paginator.count,
            "page": self.page.number,
            "pages": self.page.paginator.num_pages,
            "page_size": self.get_page_size(self.request),
            "next": self.get_next_link(),
            "previous": self.get_previous_link(),
            "results": data,
        })
